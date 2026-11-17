import {Router} from 'express';
import type {DbContext} from '../db.ts';
import {sanitizeRelativePath} from '../security.ts';

function renderStatusPage(title: string, message: string, code: number): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${code} — ${title}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #070b14; color: #f1f5f9; display: grid; place-items: center; min-height: 100vh; padding: 24px; }
    .box { max-width: 460px; width: 100%; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; background: #0e1525; }
    .code { font-family: monospace; font-size: 13px; color: #38bdf8; margin-bottom: 8px; }
    h1 { font-size: 22px; margin: 0 0 10px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
    a { color: #38bdf8; text-decoration: none; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="box">
    <div class="code">HTTP ${code}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">Return to WebLaunch AI</a>
  </div>
</body>
</html>`;
}

export function createPublicSiteRouter(ctx: DbContext): Router {
  const router = Router();

  // Redirect /sites/:slug without trailing slash to /sites/:slug/ so relative assets resolve properly
  router.get('/:slug', (req, res, next) => {
    if (!req.originalUrl.split('?')[0].endsWith('/')) {
      res.redirect(301, `${req.baseUrl}/${req.params.slug}/`);
      return;
    }
    next();
  });

  const handleServe = (req: import('express').Request, res: import('express').Response) => {
    const slug = req.params.slug;

    // Strip any auth cookie awareness and enforce strict isolation headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self';",
    );

    const site = ctx.db
      .prepare('SELECT id, slug, status, active_version_id FROM websites WHERE slug = ?')
      .get(slug) as
      | {id: string; slug: string; status: string; active_version_id: string | null}
      | undefined;

    if (!site || !site.active_version_id) {
      res.status(404).type('text/html').send(renderStatusPage('Website Not Found', 'No published website exists at this address.', 404));
      return;
    }

    if (site.status === 'suspended') {
      res
        .status(403)
        .type('text/html')
        .send(renderStatusPage('Website Suspended', 'This website has been suspended by platform moderation.', 403));
      return;
    }

    if (site.status === 'unpublished') {
      res
        .status(404)
        .type('text/html')
        .send(renderStatusPage('Website Unpublished', 'The owner has temporarily unpublished this website.', 404));
      return;
    }

    const rawSubpath = String(req.params[0] || '').replace(/^\/+/, '');
    const candidates: string[] = [];

    if (!rawSubpath) {
      candidates.push('index.html');
    } else {
      try {
        const clean = sanitizeRelativePath(rawSubpath);
        candidates.push(clean);
        if (!clean.includes('.')) {
          candidates.push(`${clean}.html`, `${clean}/index.html`);
        }
      } catch {
        res.status(400).type('text/html').send(renderStatusPage('Invalid Path', 'The requested file path is not allowed.', 400));
        return;
      }
    }

    let matchedFile: {storage_key: string; mime_type: string; path: string} | undefined;
    for (const candidate of candidates) {
      const row = ctx.db
        .prepare(
          'SELECT storage_key, mime_type, path FROM website_files WHERE version_id = ? AND path = ?',
        )
        .get(site.active_version_id, candidate) as typeof matchedFile;
      if (row) {
        matchedFile = row;
        break;
      }
    }

    if (!matchedFile) {
      // Check custom 404.html inside the site
      const custom404 = ctx.db
        .prepare("SELECT storage_key, mime_type FROM website_files WHERE version_id = ? AND path = '404.html'")
        .get(site.active_version_id) as {storage_key: string; mime_type: string} | undefined;

      if (custom404) {
        const buf = ctx.storage.getObject(custom404.storage_key);
        if (buf) {
          res.status(404).setHeader('Content-Type', custom404.mime_type).send(buf);
          return;
        }
      }

      res
        .status(404)
        .type('text/html')
        .send(renderStatusPage('Page Not Found', `The file "${rawSubpath || 'index.html'}" was not found in this deployment.`, 404));
      return;
    }

    const fileBuffer = ctx.storage.getObject(matchedFile.storage_key);
    if (!fileBuffer) {
      res
        .status(404)
        .type('text/html')
        .send(renderStatusPage('Asset Missing', 'This asset could not be retrieved from object storage.', 404));
      return;
    }

    const isHtml = matchedFile.mime_type.startsWith('text/html');
    if (isHtml) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      ctx.db.prepare('UPDATE websites SET visits_count = visits_count + 1 WHERE id = ?').run(site.id);
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }

    res.setHeader('Content-Type', matchedFile.mime_type);
    res.send(fileBuffer);
  };

  router.get('/:slug/', handleServe);
  router.get('/:slug/*', handleServe);

  return router;
}
