import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {LocalObjectStore} from './storage.ts';

export interface DbContext {
  db: Database.Database;
  storage: LocalObjectStore;
  dataDir: string;
}

export function initDatabase(customDataDir?: string): DbContext {
  const dataDir = path.resolve(customDataDir || process.env.DATA_DIR || '.weblaunch_data');
  fs.mkdirSync(dataDir, {recursive: true});

  const dbPath = path.join(dataDir, 'weblaunch.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const migrationPath = path.resolve(process.cwd(), 'migrations', '0001_initial.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  db.exec(migrationSql);

  const storage = new LocalObjectStore(dataDir);
  seedInitialData(db, storage);

  return {db, storage, dataDir};
}

function seedInitialData(db: Database.Database, storage: LocalObjectStore): void {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as {count: number};
  if (existingUsers.count > 0) {
    return;
  }

  const now = Date.now();
  const adminId = 'usr_admin_01';
  const creatorId = 'usr_creator_01';

  const adminHash = bcrypt.hashSync('Admin123!', 10);
  const creatorHash = bcrypt.hashSync('Demo1234!', 10);

  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, avatar_url, quota_bytes, is_guest, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    adminId,
    'admin@weblaunch.dev',
    'Platform Admin',
    adminHash,
    'admin',
    '/src/assets/images/avatar_founder_1794934539788.jpg',
    524288000,
    now - 86400000 * 14,
    now,
  );

  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, avatar_url, quota_bytes, is_guest, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    creatorId,
    'creator@weblaunch.dev',
    'Nadia Rahman',
    creatorHash,
    'user',
    '/src/assets/images/avatar_founder_1794934539788.jpg',
    104857600,
    now - 86400000 * 7,
    now,
  );

  // Seed two real live published sample websites stored in R2 object storage
  const sampleSites = [
    {
      id: 'site_aurora_01',
      slug: 'aurora-studio',
      userId: creatorId,
      name: 'Aurora Design Studio',
      description: 'Minimalist architecture portfolio site hosted live on WebLaunch AI.',
      visits: 1428,
      files: [
        {
          path: 'index.html',
          mimeType: 'text/html; charset=utf-8',
          content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Aurora Design Studio</title>
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <span class="brand">Aurora Studio</span>
      <nav><a href="#work">Selected Work</a><a href="about.html">About</a></nav>
    </header>
    <section class="hero">
      <h1>Spatial Architecture for Modern Cities</h1>
      <p>Civic pavilions, daylight museums, and low-carbon timber structures across South Asia and Europe.</p>
      <a class="cta" href="about.html">Explore Practice</a>
    </section>
    <section id="work" class="grid">
      <article class="card"><h2>01. Dhaka River Pavilion</h2><p>Public boardwalk and monsoon rainwater canopy completed 2025.</p></article>
      <article class="card"><h2>02. Nordic Timber Archive</h2><p>Cross-laminated timber civic library powered by geothermal heat.</p></article>
    </section>
  </main>
  <script src="assets/app.js"></script>
</body>
</html>`,
        },
        {
          path: 'about.html',
          mimeType: 'text/html; charset=utf-8',
          content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>About — Aurora Design Studio</title>
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="index.html">Aurora Studio</a>
      <nav><a href="index.html">Home</a><a href="about.html">About</a></nav>
    </header>
    <section class="hero">
      <h1>Founded in 2019</h1>
      <p>We pair structural engineering with local craftsmanship to build enduring public spaces.</p>
      <a class="cta" href="index.html">Back to Home</a>
    </section>
  </main>
</body>
</html>`,
        },
        {
          path: 'assets/style.css',
          mimeType: 'text/css; charset=utf-8',
          content: `:root { color-scheme: dark; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #f1f5f9; line-height: 1.6; }
.shell { max-width: 960px; margin: 0 auto; padding: 32px 24px; }
.topbar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 24px; border-bottom: 1px solid #1e293b; }
.brand { font-weight: 700; color: #f8fafc; text-decoration: none; font-size: 18px; }
nav { display: flex; gap: 24px; }
nav a { color: #94a3b8; text-decoration: none; font-size: 14px; }
nav a:hover { color: #38bdf8; }
.hero { padding: 72px 0 48px; }
h1 { font-size: clamp(2rem, 4vw, 3.25rem); line-height: 1.1; margin: 0 0 16px; max-width: 18ch; }
.hero p { color: #94a3b8; max-width: 56ch; margin: 0 0 28px; }
.cta { display: inline-block; padding: 12px 22px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin-top: 24px; }
.card { padding: 24px; border: 1px solid #1e293b; border-radius: 12px; background: #0f172a; }
.card h2 { font-size: 18px; margin: 0 0 8px; }
.card p { margin: 0; color: #94a3b8; font-size: 14px; }`,
        },
        {
          path: 'assets/app.js',
          mimeType: 'application/javascript; charset=utf-8',
          content: `console.log('Aurora Design Studio loaded cleanly on WebLaunch AI.');`,
        },
      ],
    },
    {
      id: 'site_monsoon_02',
      slug: 'monsoon-coffee',
      userId: creatorId,
      name: 'Monsoon Roasters',
      description: 'Single-origin specialty coffee landing page.',
      visits: 614,
      files: [
        {
          path: 'index.html',
          mimeType: 'text/html; charset=utf-8',
          content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Monsoon Roasters</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; background: #14110f; color: #f5efe6; padding: 48px 24px; }
    main { max-width: 720px; margin: 0 auto; border-top: 1px solid #3c342e; padding-top: 32px; }
    h1 { font-size: 42px; margin: 0 0 16px; font-weight: 500; }
    p { color: #c7bdb1; line-height: 1.7; }
    .lot { margin-top: 32px; padding: 20px; border: 1px solid #3c342e; border-radius: 10px; }
  </style>
</head>
<body>
  <main>
    <h1>Monsoon Highland Coffee</h1>
    <p>Small-lot Arabica roasted weekly in Sylhet and shipped fresh across Bangladesh.</p>
    <div class="lot">
      <strong>Lot 04 — Bandarban Washed Bourbon</strong>
      <p>Tasting notes: Bergamot, dark cacao, toasted almond.</p>
    </div>
  </main>
</body>
</html>`,
        },
      ],
    },
  ];

  let totalCreatorBytes = 0;
  let totalCreatorFiles = 0;

  for (const site of sampleSites) {
    const versionId = `ver_${site.id}_1`;
    const prefix = `sites/${site.id}/v1`;
    const preparedFiles = site.files.map((file) => {
      const buf = Buffer.from(file.content, 'utf-8');
      const key = `${prefix}/${file.path}`;
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      storage.putObject(key, buf);
      return {
        path: file.path,
        mimeType: file.mimeType,
        key,
        sizeBytes: buf.length,
        sha256,
      };
    });
    const siteBytes = preparedFiles.reduce((sum, f) => sum + f.sizeBytes, 0);

    db.prepare(
      `INSERT INTO websites (id, slug, user_id, name, description, status, active_version_id, storage_bytes, file_count, visits_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    ).run(
      site.id,
      site.slug,
      site.userId,
      site.name,
      site.description,
      versionId,
      siteBytes,
      site.files.length,
      site.visits,
      now - 86400000 * 4,
      now - 86400000 * 1,
    );

    db.prepare(
      `INSERT INTO deployment_versions (id, website_id, version_number, storage_prefix, file_count, total_bytes, entry_file, commit_note, created_at)
       VALUES (?, ?, 1, ?, ?, ?, 'index.html', 'Initial live release', ?)`,
    ).run(versionId, site.id, prefix, site.files.length, siteBytes, now - 86400000 * 1);

    for (const pf of preparedFiles) {
      db.prepare(
        `INSERT INTO website_files (id, website_id, version_id, path, storage_key, mime_type, size_bytes, sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `fil_${crypto.randomBytes(6).toString('hex')}`,
        site.id,
        versionId,
        pf.path,
        pf.key,
        pf.mimeType,
        pf.sizeBytes,
        pf.sha256,
        now - 86400000 * 3,
      );
    }

    db.prepare(
      `INSERT INTO deployments (id, website_id, user_id, version_id, status, file_count, total_bytes, duration_ms, created_at)
       VALUES (?, ?, ?, ?, 'success', ?, ?, ?, ?)`,
    ).run(
      `dep_${crypto.randomBytes(6).toString('hex')}`,
      site.id,
      site.userId,
      versionId,
      site.files.length,
      siteBytes,
      340,
      now - 86400000 * 1,
    );

    totalCreatorBytes += siteBytes;
    totalCreatorFiles += site.files.length;
  }

  db.prepare(
    `INSERT INTO storage_usage (user_id, total_bytes, file_count, website_count, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(creatorId, totalCreatorBytes, totalCreatorFiles, sampleSites.length, now);

  db.prepare(
    `INSERT INTO storage_usage (user_id, total_bytes, file_count, website_count, updated_at)
     VALUES (?, 0, 0, 0, ?)`,
  ).run(adminId, now);

  db.prepare(
    `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
     VALUES (?, ?, ?, ?, 'success', 0, ?)`,
  ).run(
    `ntf_${crypto.randomBytes(6).toString('hex')}`,
    creatorId,
    'Aurora Design Studio is live',
    'Deployment v1 verified and active at /sites/aurora-studio/.',
    now - 3600000 * 5,
  );

  db.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, details, ip_address, created_at)
     VALUES (?, ?, 'website.publish', 'website', 'site_aurora_01', 'Published version 1 (4 files)', '127.0.0.1', ?)`,
  ).run(`aud_${crypto.randomBytes(6).toString('hex')}`, creatorId, now - 86400000 * 1);
}
