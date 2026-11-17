export interface Env {
  DB: D1Database;
  SITES_BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  MAX_UPLOAD_BYTES?: string;
  MAX_FILES_PER_SITE?: string;
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function sanitizePath(raw: string): string | null {
  const clean = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..') || clean.includes('\0')) return null;
  return clean;
}

export async function handlePublicSiteRequest(request: Request, env: Env, slug: string, subPath: string): Promise<Response> {
  const site = await env.DB.prepare(
    'SELECT id, status, active_version_id FROM websites WHERE slug = ?',
  )
    .bind(slug)
    .first<{id: string; status: string; active_version_id: string | null}>();

  if (!site || !site.active_version_id) {
    return new Response('Website Not Found', {status: 404});
  }
  if (site.status === 'suspended') {
    return new Response('Website Suspended', {status: 403});
  }
  if (site.status === 'unpublished') {
    return new Response('Website Unpublished', {status: 404});
  }

  const normalizedSub = subPath ? sanitizePath(subPath) : 'index.html';
  if (!normalizedSub) {
    return new Response('Invalid Path', {status: 400});
  }

  const candidates = [normalizedSub];
  if (!normalizedSub.includes('.')) {
    candidates.push(`${normalizedSub}.html`, `${normalizedSub}/index.html`);
  }

  for (const candidate of candidates) {
    const fileRow = await env.DB.prepare(
      'SELECT storage_key, mime_type FROM website_files WHERE version_id = ? AND path = ?',
    )
      .bind(site.active_version_id, candidate)
      .first<{storage_key: string; mime_type: string}>();

    if (fileRow) {
      const object = await env.SITES_BUCKET.get(fileRow.storage_key);
      if (!object) continue;

      const ext = candidate.slice(candidate.lastIndexOf('.')).toLowerCase();
      const contentType = fileRow.mime_type || MIME_MAP[ext] || 'application/octet-stream';
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set(
        'Content-Security-Policy',
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self';",
      );
      headers.set('Cache-Control', contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=300');

      return new Response(object.body, {status: 200, headers});
    }
  }

  return new Response('Page Not Found', {status: 404});
}
