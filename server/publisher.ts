import crypto from 'crypto';
import type {DbContext} from './db.ts';
import {
  DEFAULT_UPLOAD_LIMITS,
  extractAndValidateZip,
  validateBatchFiles,
  type ValidatedFile,
} from './security.ts';

export interface PublishInput {
  userId: string;
  websiteId?: string;
  name: string;
  description?: string;
  commitNote?: string;
  zipBuffer?: Buffer;
  rawFiles?: Array<{path: string; buffer: Buffer}>;
  ipAddress?: string;
}

export interface PublishResult {
  websiteId: string;
  slug: string;
  versionId: string;
  versionNumber: number;
  deploymentId: string;
  publicPath: string;
  fileCount: number;
  totalBytes: number;
  durationMs: number;
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  const suffix = crypto.randomBytes(3).toString('hex');
  return base ? `${base}-${suffix}` : `site-${suffix}`;
}

export function recalculateUserStorage(ctx: DbContext, userId: string): {totalBytes: number; fileCount: number; websiteCount: number} {
  const row = ctx.db
    .prepare(
      `SELECT
         COALESCE(SUM(total_bytes), 0) as total_bytes,
         COALESCE(SUM(file_count), 0) as file_count
       FROM deployment_versions
       WHERE website_id IN (SELECT id FROM websites WHERE user_id = ?)`,
    )
    .get(userId) as {total_bytes: number; file_count: number};

  const siteCountRow = ctx.db
    .prepare('SELECT COUNT(*) as count FROM websites WHERE user_id = ?')
    .get(userId) as {count: number};

  const now = Date.now();
  ctx.db
    .prepare(
      `INSERT INTO storage_usage (user_id, total_bytes, file_count, website_count, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         total_bytes = excluded.total_bytes,
         file_count = excluded.file_count,
         website_count = excluded.website_count,
         updated_at = excluded.updated_at`,
    )
    .run(userId, row.total_bytes, row.file_count, siteCountRow.count, now);

  return {
    totalBytes: row.total_bytes,
    fileCount: row.file_count,
    websiteCount: siteCountRow.count,
  };
}

export function publishWebsite(ctx: DbContext, input: PublishInput): PublishResult {
  const startedAt = Date.now();
  const deploymentId = `dep_${crypto.randomBytes(6).toString('hex')}`;
  let targetWebsiteId = input.websiteId || `site_${crypto.randomBytes(6).toString('hex')}`;

  // Check user & quota
  const user = ctx.db
    .prepare('SELECT id, quota_bytes, suspended FROM users WHERE id = ?')
    .get(input.userId) as {id: string; quota_bytes: number; suspended: number} | undefined;

  if (!user) {
    throw new Error('User account not found.');
  }
  if (user.suspended) {
    throw new Error('Account is suspended and cannot publish websites.');
  }

  let existingSite:
    | {id: string; slug: string; user_id: string; name: string; active_version_id: string | null}
    | undefined;

  if (input.websiteId) {
    existingSite = ctx.db
      .prepare('SELECT id, slug, user_id, name, active_version_id FROM websites WHERE id = ?')
      .get(input.websiteId) as typeof existingSite;
    if (!existingSite) {
      throw new Error('Target website not found.');
    }
    if (existingSite.user_id !== input.userId) {
      throw new Error('You do not have permission to update this website.');
    }
    targetWebsiteId = existingSite.id;
  }

  let validatedFiles: ValidatedFile[];
  try {
    if (input.zipBuffer) {
      const extracted = extractAndValidateZip(input.zipBuffer, DEFAULT_UPLOAD_LIMITS);
      const hasIndex = extracted.some((f) => f.path.toLowerCase() === 'index.html');
      if (!hasIndex) {
        throw new Error('Missing required "index.html" inside the uploaded ZIP archive.');
      }
      validatedFiles = extracted;
    } else if (input.rawFiles && input.rawFiles.length > 0) {
      validatedFiles = validateBatchFiles(input.rawFiles, DEFAULT_UPLOAD_LIMITS);
    } else {
      throw new Error('No website files or ZIP archive provided.');
    }
  } catch (err) {
    // Record failed deployment if updating an existing website
    if (existingSite) {
      ctx.db
        .prepare(
          `INSERT INTO deployments (id, website_id, user_id, version_id, status, file_count, total_bytes, error_message, duration_ms, created_at)
           VALUES (?, ?, ?, NULL, 'failed', 0, 0, ?, ?, ?)`,
        )
        .run(
          deploymentId,
          existingSite.id,
          input.userId,
          err instanceof Error ? err.message : 'Validation failed',
          Date.now() - startedAt,
          Date.now(),
        );
    }
    throw err;
  }

  const totalBytes = validatedFiles.reduce((sum, f) => sum + f.sizeBytes, 0);
  const currentUsage = recalculateUserStorage(ctx, input.userId);
  if (currentUsage.totalBytes + totalBytes > user.quota_bytes) {
    throw new Error(
      `Storage quota exceeded. Current usage + upload exceeds your ${(user.quota_bytes / (1024 * 1024)).toFixed(0)} MB limit.`,
    );
  }

  // Prevent duplicate deployment if identical file manifest already active
  if (existingSite?.active_version_id) {
    const activeFiles = ctx.db
      .prepare('SELECT path, sha256 FROM website_files WHERE version_id = ? ORDER BY path ASC')
      .all(existingSite.active_version_id) as Array<{path: string; sha256: string}>;

    const incomingSorted = [...validatedFiles].sort((a, b) => a.path.localeCompare(b.path));
    if (
      activeFiles.length === incomingSorted.length &&
      activeFiles.every((f, idx) => f.path === incomingSorted[idx].path && f.sha256 === incomingSorted[idx].sha256)
    ) {
      throw new Error('Duplicate upload detected: the uploaded files are identical to the currently active version.');
    }
  }

  const now = Date.now();
  const slug = existingSite ? existingSite.slug : generateSlug(input.name || 'my-site');
  const maxVerRow = ctx.db
    .prepare('SELECT COALESCE(MAX(version_number), 0) as max_ver FROM deployment_versions WHERE website_id = ?')
    .get(targetWebsiteId) as {max_ver: number};
  const versionNumber = maxVerRow.max_ver + 1;
  const versionId = `ver_${targetWebsiteId}_${versionNumber}_${crypto.randomBytes(3).toString('hex')}`;
  const storagePrefix = `sites/${targetWebsiteId}/v${versionNumber}`;

  // Upload all validated files to object store namespace
  for (const file of validatedFiles) {
    const storageKey = `${storagePrefix}/${file.path}`;
    ctx.storage.putObject(storageKey, file.buffer);
  }

  // Verify index.html exists in object store before marking success
  const entryKey = `${storagePrefix}/index.html`;
  if (!ctx.storage.hasObject(entryKey)) {
    ctx.storage.deletePrefix(storagePrefix);
    throw new Error('Verification failed: index.html could not be verified in object storage.');
  }

  const durationMs = Math.max(12, Date.now() - startedAt);

  const tx = ctx.db.transaction(() => {
    if (!existingSite) {
      ctx.db
        .prepare(
          `INSERT INTO websites (id, slug, user_id, name, description, status, active_version_id, storage_bytes, file_count, visits_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, 0, ?, ?)`,
        )
        .run(
          targetWebsiteId,
          slug,
          input.userId,
          input.name.trim() || 'Untitled Website',
          input.description?.trim() || '',
          versionId,
          totalBytes,
          validatedFiles.length,
          now,
          now,
        );
    } else {
      ctx.db
        .prepare(
          `UPDATE websites
           SET name = COALESCE(NULLIF(?, ''), name),
               status = 'active',
               active_version_id = ?,
               storage_bytes = ?,
               file_count = ?,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(input.name.trim(), versionId, totalBytes, validatedFiles.length, now, targetWebsiteId);
    }

    ctx.db
      .prepare(
        `INSERT INTO deployment_versions (id, website_id, version_number, storage_prefix, file_count, total_bytes, entry_file, commit_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'index.html', ?, ?)`,
      )
      .run(
        versionId,
        targetWebsiteId,
        versionNumber,
        storagePrefix,
        validatedFiles.length,
        totalBytes,
        input.commitNote?.trim() || `Release v${versionNumber}`,
        now,
      );

    const insertFileStmt = ctx.db.prepare(
      `INSERT INTO website_files (id, website_id, version_id, path, storage_key, mime_type, size_bytes, sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const file of validatedFiles) {
      insertFileStmt.run(
        `fil_${crypto.randomBytes(6).toString('hex')}`,
        targetWebsiteId,
        versionId,
        file.path,
        `${storagePrefix}/${file.path}`,
        file.mimeType,
        file.sizeBytes,
        file.sha256,
        now,
      );
    }

    ctx.db
      .prepare(
        `INSERT INTO deployments (id, website_id, user_id, version_id, status, file_count, total_bytes, duration_ms, created_at)
         VALUES (?, ?, ?, ?, 'success', ?, ?, ?, ?)`,
      )
      .run(deploymentId, targetWebsiteId, input.userId, versionId, validatedFiles.length, totalBytes, durationMs, now);

    ctx.db
      .prepare(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
         VALUES (?, ?, ?, ?, 'success', 0, ?)`,
      )
      .run(
        `ntf_${crypto.randomBytes(6).toString('hex')}`,
        input.userId,
        `${input.name.trim() || slug} published (v${versionNumber})`,
        `Live at /sites/${slug}/ with ${validatedFiles.length} verified files.`,
        now,
      );

    ctx.db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, details, ip_address, created_at)
         VALUES (?, ?, 'website.publish', 'website', ?, ?, ?, ?)`,
      )
      .run(
        `aud_${crypto.randomBytes(6).toString('hex')}`,
        input.userId,
        targetWebsiteId,
        `Published v${versionNumber} (${validatedFiles.length} files, ${totalBytes} bytes)`,
        input.ipAddress || '',
        now,
      );
  });

  tx();
  recalculateUserStorage(ctx, input.userId);

  return {
    websiteId: targetWebsiteId,
    slug,
    versionId,
    versionNumber,
    deploymentId,
    publicPath: `/sites/${slug}/`,
    fileCount: validatedFiles.length,
    totalBytes,
    durationMs,
  };
}

export function rollbackWebsiteVersion(
  ctx: DbContext,
  websiteId: string,
  versionId: string,
  userId: string,
  ipAddress = '',
): {versionNumber: number; slug: string} {
  const site = ctx.db
    .prepare('SELECT id, slug, user_id FROM websites WHERE id = ?')
    .get(websiteId) as {id: string; slug: string; user_id: string} | undefined;

  if (!site) throw new Error('Website not found.');
  if (site.user_id !== userId) throw new Error('Unauthorized to modify this website.');

  const version = ctx.db
    .prepare(
      'SELECT id, version_number, storage_prefix, file_count, total_bytes FROM deployment_versions WHERE id = ? AND website_id = ?',
    )
    .get(versionId, websiteId) as
    | {id: string; version_number: number; storage_prefix: string; file_count: number; total_bytes: number}
    | undefined;

  if (!version) throw new Error('Target version does not exist.');
  if (!ctx.storage.hasObject(`${version.storage_prefix}/index.html`)) {
    throw new Error('Target version files are no longer available in object storage.');
  }

  const now = Date.now();
  const tx = ctx.db.transaction(() => {
    ctx.db
      .prepare(
        `UPDATE websites
         SET active_version_id = ?, storage_bytes = ?, file_count = ?, status = 'active', updated_at = ?
         WHERE id = ?`,
      )
      .run(version.id, version.total_bytes, version.file_count, now, websiteId);

    ctx.db
      .prepare(
        `INSERT INTO deployments (id, website_id, user_id, version_id, status, file_count, total_bytes, duration_ms, created_at)
         VALUES (?, ?, ?, ?, 'success', ?, ?, 25, ?)`,
      )
      .run(
        `dep_${crypto.randomBytes(6).toString('hex')}`,
        websiteId,
        userId,
        version.id,
        version.file_count,
        version.total_bytes,
        now,
      );

    ctx.db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, details, ip_address, created_at)
         VALUES (?, ?, 'website.rollback', 'website', ?, ?, ?, ?)`,
      )
      .run(
        `aud_${crypto.randomBytes(6).toString('hex')}`,
        userId,
        websiteId,
        `Rolled back to v${version.version_number}`,
        ipAddress,
        now,
      );
  });

  tx();
  return {versionNumber: version.version_number, slug: site.slug};
}

export function deleteWebsiteById(
  ctx: DbContext,
  websiteId: string,
  actorUserId: string,
  isAdmin: boolean,
  ipAddress = '',
): void {
  const site = ctx.db
    .prepare('SELECT id, user_id, slug FROM websites WHERE id = ?')
    .get(websiteId) as {id: string; user_id: string; slug: string} | undefined;

  if (!site) throw new Error('Website not found.');
  if (!isAdmin && site.user_id !== actorUserId) {
    throw new Error('You do not have permission to delete this website.');
  }

  ctx.storage.deletePrefix(`sites/${site.id}`);
  ctx.db.prepare('DELETE FROM websites WHERE id = ?').run(site.id);

  ctx.db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, details, ip_address, created_at)
       VALUES (?, ?, 'website.delete', 'website', ?, ?, ?, ?)`,
    )
    .run(
      `aud_${crypto.randomBytes(6).toString('hex')}`,
      actorUserId,
      site.id,
      `Deleted website /sites/${site.slug}/`,
      ipAddress,
      Date.now(),
    );

  recalculateUserStorage(ctx, site.user_id);
}
