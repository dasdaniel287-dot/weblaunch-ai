import crypto from 'crypto';
import {Router} from 'express';
import multer from 'multer';
import type {DbContext} from '../db.ts';
import {ensurePublisherSession, requireAuth} from '../middleware/auth.ts';
import {deleteWebsiteById, publishWebsite, rollbackWebsiteVersion} from '../publisher.ts';
import {createRateLimiter, DEFAULT_UPLOAD_LIMITS} from '../security.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: DEFAULT_UPLOAD_LIMITS.maxUploadBytes,
    files: DEFAULT_UPLOAD_LIMITS.maxFilesPerSite + 5,
  },
});

export function createWebsitesRouter(ctx: DbContext): Router {
  const router = Router();
  const publishLimiter = createRateLimiter('publish', 25, 60 * 1000);

  // Public platform overview stats (safe aggregate numbers)
  router.get('/stats/public', (_req, res) => {
    const siteStats = ctx.db
      .prepare(
        `SELECT
           COUNT(*) as total_websites,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_websites,
           COALESCE(SUM(storage_bytes), 0) as total_storage_bytes,
           COALESCE(SUM(visits_count), 0) as total_visits
         FROM websites`,
      )
      .get() as {
        total_websites: number;
        active_websites: number;
        total_storage_bytes: number;
        total_visits: number;
      };

    const userStats = ctx.db
      .prepare('SELECT COUNT(*) as total_users FROM users WHERE is_guest = 0')
      .get() as {total_users: number};

    const deployStats = ctx.db
      .prepare(
        `SELECT
           COUNT(*) as total_deployments,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_deployments,
           COALESCE(AVG(duration_ms), 0) as avg_duration_ms
         FROM deployments`,
      )
      .get() as {
        total_deployments: number;
        failed_deployments: number;
        avg_duration_ms: number;
      };

    const showcaseSites = ctx.db
      .prepare(
        `SELECT id, slug, name, description, file_count, storage_bytes, visits_count, updated_at
         FROM websites
         WHERE status = 'active'
         ORDER BY visits_count DESC, updated_at DESC
         LIMIT 4`,
      )
      .all();

    res.json({
      totalWebsites: siteStats.total_websites || 0,
      activeWebsites: siteStats.active_websites || 0,
      totalStorageBytes: siteStats.total_storage_bytes || 0,
      totalVisits: siteStats.total_visits || 0,
      totalUsers: userStats.total_users || 0,
      totalDeployments: deployStats.total_deployments || 0,
      failedDeployments: deployStats.failed_deployments || 0,
      avgDurationMs: Math.round(deployStats.avg_duration_ms || 0),
      showcaseSites,
    });
  });

  // Dashboard aggregate metrics & activity for current user (or platform overview if unauthenticated)
  router.get('/dashboard', (req, res) => {
    const siteTotals = ctx.db
      .prepare(
        `SELECT
           COUNT(*) as total_websites,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_websites,
           COALESCE(SUM(storage_bytes), 0) as total_storage_bytes,
           COALESCE(SUM(visits_count), 0) as total_visits
         FROM websites`,
      )
      .get() as {
        total_websites: number;
        active_websites: number;
        total_storage_bytes: number;
        total_visits: number;
      };

    const userCount = (
      ctx.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_guest = 0').get() as {count: number}
    ).count;

    const failedCount = (
      ctx.db.prepare("SELECT COUNT(*) as count FROM deployments WHERE status = 'failed'").get() as {count: number}
    ).count;

    const recentDeployments = req.authUser
      ? ctx.db
          .prepare(
            `SELECT d.id, d.website_id, w.name as website_name, w.slug, d.status, d.file_count, d.total_bytes, d.duration_ms, d.error_message, d.created_at,
                    dv.version_number
             FROM deployments d
             JOIN websites w ON w.id = d.website_id
             LEFT JOIN deployment_versions dv ON dv.id = d.version_id
             WHERE d.user_id = ?
             ORDER BY d.created_at DESC
             LIMIT 12`,
          )
          .all(req.authUser.id)
      : ctx.db
          .prepare(
            `SELECT d.id, d.website_id, w.name as website_name, w.slug, d.status, d.file_count, d.total_bytes, d.duration_ms, d.error_message, d.created_at,
                    dv.version_number
             FROM deployments d
             JOIN websites w ON w.id = d.website_id
             LEFT JOIN deployment_versions dv ON dv.id = d.version_id
             WHERE w.status = 'active'
             ORDER BY d.created_at DESC
             LIMIT 8`,
          )
          .all();

    const myWebsites = req.authUser
      ? ctx.db
          .prepare(
            `SELECT id, slug, name, description, status, active_version_id, storage_bytes, file_count, visits_count, created_at, updated_at
             FROM websites
             WHERE user_id = ?
             ORDER BY updated_at DESC`,
          )
          .all(req.authUser.id)
      : [];

    res.json({
      metrics: {
        totalWebsites: siteTotals.total_websites || 0,
        activeWebsites: siteTotals.active_websites || 0,
        totalUsers: userCount,
        totalStorageBytes: siteTotals.total_storage_bytes || 0,
        failedDeployments: failedCount,
        totalVisits: siteTotals.total_visits || 0,
      },
      recentDeployments,
      myWebsites,
    });
  });

  // List owned websites
  router.get('/websites', requireAuth, (req, res) => {
    const rows = ctx.db
      .prepare(
        `SELECT w.*, dv.version_number as active_version_number
         FROM websites w
         LEFT JOIN deployment_versions dv ON dv.id = w.active_version_id
         WHERE w.user_id = ?
         ORDER BY w.updated_at DESC`,
      )
      .all(req.authUser!.id);
    res.json({websites: rows});
  });

  // Get single website with versions & active files
  router.get('/websites/:id', requireAuth, (req, res) => {
    const site = ctx.db
      .prepare('SELECT * FROM websites WHERE id = ?')
      .get(req.params.id) as {id: string; user_id: string; active_version_id: string | null} | undefined;

    if (!site) {
      res.status(404).json({error: 'Website not found.'});
      return;
    }
    if (site.user_id !== req.authUser!.id && req.authUser!.role !== 'admin') {
      res.status(403).json({error: 'Access denied.'});
      return;
    }

    const versions = ctx.db
      .prepare('SELECT * FROM deployment_versions WHERE website_id = ? ORDER BY version_number DESC')
      .all(site.id);

    const files = site.active_version_id
      ? ctx.db
          .prepare('SELECT id, path, mime_type, size_bytes, sha256, created_at FROM website_files WHERE version_id = ? ORDER BY path ASC')
          .all(site.active_version_id)
      : [];

    const deployments = ctx.db
      .prepare(
        `SELECT d.*, dv.version_number
         FROM deployments d
         LEFT JOIN deployment_versions dv ON dv.id = d.version_id
         WHERE d.website_id = ?
         ORDER BY d.created_at DESC
         LIMIT 20`,
      )
      .all(site.id);

    res.json({website: site, versions, files, deployments});
  });

  // One-Click Publish Website (Multipart ZIP or multiple files OR JSON raw files)
  router.post('/publish', publishLimiter, upload.any(), (req, res) => {
    try {
      const user = ensurePublisherSession(ctx, req, res);
      const name = String(req.body?.name || 'My Published Website').slice(0, 80);
      const description = String(req.body?.description || '').slice(0, 240);
      const commitNote = String(req.body?.commitNote || 'Initial release').slice(0, 140);
      const websiteId = req.body?.websiteId ? String(req.body.websiteId) : undefined;

      const uploadedFiles = (req.files as Express.Multer.File[]) || [];

      let result;
      if (uploadedFiles.length === 1 && uploadedFiles[0].originalname.toLowerCase().endsWith('.zip')) {
        result = publishWebsite(ctx, {
          userId: user.id,
          websiteId,
          name,
          description,
          commitNote,
          zipBuffer: uploadedFiles[0].buffer,
          ipAddress: req.ip,
        });
      } else if (uploadedFiles.length > 0) {
        let pathsMeta: string[] = [];
        if (req.body?.paths) {
          try {
            const parsed = JSON.parse(String(req.body.paths));
            if (Array.isArray(parsed)) {
              pathsMeta = parsed.map(String);
            }
          } catch {
            pathsMeta = [];
          }
        }

        const rawFiles = uploadedFiles.map((f, index) => ({
          path: pathsMeta[index] || f.originalname,
          buffer: f.buffer,
        }));

        result = publishWebsite(ctx, {
          userId: user.id,
          websiteId,
          name,
          description,
          commitNote,
          rawFiles,
          ipAddress: req.ip,
        });
      } else if (Array.isArray(req.body?.files) && req.body.files.length > 0) {
        const rawFiles = req.body.files.map((item: {path: string; content: string; encoding?: string}) => ({
          path: String(item.path),
          buffer: Buffer.from(String(item.content || ''), item.encoding === 'base64' ? 'base64' : 'utf-8'),
        }));

        result = publishWebsite(ctx, {
          userId: user.id,
          websiteId,
          name,
          description,
          commitNote,
          rawFiles,
          ipAddress: req.ip,
        });
      } else {
        res.status(400).json({error: 'Please upload an index.html, website files, or a .zip archive.'});
        return;
      }

      res.status(201).json({
        success: true,
        deployment: result,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Publishing failed.',
      });
    }
  });

  // Update website status (publish/unpublish) or metadata
  router.patch('/websites/:id', requireAuth, (req, res) => {
    const site = ctx.db
      .prepare('SELECT id, user_id, status FROM websites WHERE id = ?')
      .get(req.params.id) as {id: string; user_id: string; status: string} | undefined;

    if (!site) {
      res.status(404).json({error: 'Website not found.'});
      return;
    }
    if (site.user_id !== req.authUser!.id) {
      res.status(403).json({error: 'You can only modify your own websites.'});
      return;
    }
    if (site.status === 'suspended') {
      res.status(403).json({error: 'Suspended websites must be reviewed by an administrator.'});
      return;
    }

    const {status, name, description} = req.body || {};
    const nextStatus = status === 'active' || status === 'unpublished' ? status : site.status;

    ctx.db
      .prepare(
        `UPDATE websites
         SET status = ?,
             name = COALESCE(NULLIF(?, ''), name),
             description = COALESCE(?, description),
             updated_at = ?
         WHERE id = ?`,
      )
      .run(nextStatus, typeof name === 'string' ? name.trim().slice(0, 80) : '', typeof description === 'string' ? description.trim().slice(0, 240) : null, Date.now(), site.id);

    const updated = ctx.db.prepare('SELECT * FROM websites WHERE id = ?').get(site.id);
    res.json({website: updated});
  });

  // Rollback website to a previous deployment version
  router.post('/websites/:id/rollback', requireAuth, (req, res) => {
    try {
      const {versionId} = req.body || {};
      if (!versionId || typeof versionId !== 'string') {
        res.status(400).json({error: 'Target versionId is required.'});
        return;
      }
      const result = rollbackWebsiteVersion(ctx, req.params.id, versionId, req.authUser!.id, req.ip || '');
      res.json({ok: true, ...result});
    } catch (err) {
      res.status(400).json({error: err instanceof Error ? err.message : 'Rollback failed.'});
    }
  });

  // Delete website & clean up storage
  router.delete('/websites/:id', requireAuth, (req, res) => {
    try {
      deleteWebsiteById(
        ctx,
        req.params.id,
        req.authUser!.id,
        req.authUser!.role === 'admin',
        req.ip || '',
      );
      res.json({ok: true});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed.';
      res.status(msg.includes('permission') ? 403 : 404).json({error: msg});
    }
  });

  // Submit abuse report for a website
  router.post('/reports', (req, res) => {
    const {websiteId, slug, reporterEmail, reason, details} = req.body || {};
    if (!reason || typeof reason !== 'string') {
      res.status(400).json({error: 'Please provide a reason for the report.'});
      return;
    }

    const site = websiteId
      ? (ctx.db.prepare('SELECT id FROM websites WHERE id = ?').get(websiteId) as {id: string} | undefined)
      : (ctx.db.prepare('SELECT id FROM websites WHERE slug = ?').get(slug) as {id: string} | undefined);

    if (!site) {
      res.status(404).json({error: 'Reported website not found.'});
      return;
    }

    const reportId = `rep_${crypto.randomBytes(6).toString('hex')}`;
    ctx.db
      .prepare(
        `INSERT INTO abuse_reports (id, website_id, reporter_email, reason, details, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
      )
      .run(
        reportId,
        site.id,
        typeof reporterEmail === 'string' && reporterEmail.includes('@')
          ? reporterEmail.trim()
          : req.authUser?.email || 'anonymous@reporter.local',
        reason.trim().slice(0, 120),
        typeof details === 'string' ? details.trim().slice(0, 500) : '',
        Date.now(),
      );

    res.status(201).json({ok: true, reportId});
  });

  return router;
}
