import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';
import {createExpressApp} from '../server/app.ts';
import {initDatabase, type DbContext} from '../server/db.ts';
import {
  extractAndValidateZip,
  getSafeMimeType,
  sanitizeRelativePath,
  validateBatchFiles,
} from '../server/security.ts';

describe('WebLaunch AI End-to-End Platform Suite', () => {
  let tmpDir: string;
  let ctx: DbContext;
  let server: http.Server;
  let baseUrl: string;
  let userACookie = '';
  let userBCookie = '';
  let adminCookie = '';

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weblaunch-test-'));
    ctx = initDatabase(tmpDir);
    const app = createExpressApp(ctx);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    ctx.db.close();
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it('1. Security: blocks path traversal, null bytes, and disallowed executables', () => {
    assert.throws(() => sanitizeRelativePath('../secret.html'), /traversal/i);
    assert.throws(() => sanitizeRelativePath('sub/../../evil.js'), /traversal/i);
    assert.throws(() => sanitizeRelativePath('/etc/passwd'), /Absolute paths/i);
    assert.throws(() => sanitizeRelativePath('bad\0file.html'), /null byte/i);

    assert.throws(
      () =>
        validateBatchFiles([
          {path: 'index.html', buffer: Buffer.from('<h1>Hi</h1>')},
          {path: 'payload.php', buffer: Buffer.from('<?php echo 1; ?>')},
        ]),
      /Blocked file type/i,
    );
  });

  it('2. Validation: detects missing index.html and resolves safe MIME types', () => {
    assert.throws(
      () => validateBatchFiles([{path: 'about.html', buffer: Buffer.from('<h1>About</h1>')}]),
      /Missing required entry file "index.html"/i,
    );
    assert.equal(getSafeMimeType('index.html'), 'text/html; charset=utf-8');
    assert.equal(getSafeMimeType('assets/style.css'), 'text/css; charset=utf-8');
    assert.equal(getSafeMimeType('scripts/app.js'), 'application/javascript; charset=utf-8');
    assert.equal(getSafeMimeType('logo.svg'), 'image/svg+xml');
  });

  it('3. ZIP Extraction: extracts nested directory and enforces file count / size limits', () => {
    const zip = new AdmZip();
    zip.addFile('my-portfolio/index.html', Buffer.from('<!doctype html><html><body><h1>ZIP Site</h1></body></html>'));
    zip.addFile('my-portfolio/assets/app.css', Buffer.from('body { color: cyan; }'));
    const extracted = extractAndValidateZip(zip.toBuffer());

    assert.equal(extracted.length, 2);
    assert.ok(extracted.some((f) => f.path === 'index.html'));
    assert.ok(extracted.some((f) => f.path === 'assets/app.css'));

    assert.throws(
      () =>
        extractAndValidateZip(zip.toBuffer(), {
          maxUploadBytes: 1024 * 1024,
          maxSingleFileBytes: 1024 * 1024,
          maxFilesPerSite: 1,
          maxCompressionRatio: 100,
        }),
      /more than 1 files/i,
    );
  });

  it('4. Authentication: registers User A and User B, logs in, and scopes session cookies to /api', async () => {
    const regA = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'Alice', email: 'alice@test.dev', password: 'Password123'}),
    });
    assert.equal(regA.status, 201);
    const cookieA = regA.headers.get('set-cookie') || '';
    assert.ok(cookieA.includes('weblaunch_session='));
    assert.ok(cookieA.includes('Path=/api'));
    userACookie = cookieA.split(';')[0];

    const regB = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'Bob', email: 'bob@test.dev', password: 'Password123'}),
    });
    assert.equal(regB.status, 201);
    userBCookie = (regB.headers.get('set-cookie') || '').split(';')[0];

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {headers: {Cookie: userACookie}});
    const meJson = (await meRes.json()) as {user: {email: string}};
    assert.equal(meJson.user.email, 'alice@test.dev');
  });

  let aliceSiteId = '';
  let aliceSlug = '';
  let v1Id = '';

  it('5. Publishing & Public Routing: publishes ZIP, serves index & nested CSS with MIME and CSP headers', async () => {
    const zip = new AdmZip();
    zip.addFile(
      'index.html',
      Buffer.from('<!doctype html><html><link rel="stylesheet" href="assets/main.css"><body>Version One</body></html>'),
    );
    zip.addFile('assets/main.css', Buffer.from('body { background: #070b14; }'));

    const form = new FormData();
    form.append('name', 'Alice Launch');
    form.append('commitNote', 'First release');
    form.append('file', new Blob([new Uint8Array(zip.toBuffer())], {type: 'application/zip'}), 'site.zip');

    const pubRes = await fetch(`${baseUrl}/api/publish`, {
      method: 'POST',
      headers: {Cookie: userACookie},
      body: form,
    });
    assert.equal(pubRes.status, 201);
    const pubJson = (await pubRes.json()) as {
      deployment: {websiteId: string; slug: string; versionId: string; publicPath: string; fileCount: number};
    };

    aliceSiteId = pubJson.deployment.websiteId;
    aliceSlug = pubJson.deployment.slug;
    v1Id = pubJson.deployment.versionId;
    assert.equal(pubJson.deployment.fileCount, 2);

    // Public routing must work WITHOUT any authentication cookie
    const htmlRes = await fetch(`${baseUrl}/sites/${aliceSlug}/`);
    assert.equal(htmlRes.status, 200);
    assert.ok((htmlRes.headers.get('content-type') || '').includes('text/html'));
    assert.equal(htmlRes.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(htmlRes.headers.get('content-security-policy'));
    const htmlBody = await htmlRes.text();
    assert.ok(htmlBody.includes('Version One'));

    const cssRes = await fetch(`${baseUrl}/sites/${aliceSlug}/assets/main.css`);
    assert.equal(cssRes.status, 200);
    assert.ok((cssRes.headers.get('content-type') || '').includes('text/css'));

    const missingRes = await fetch(`${baseUrl}/sites/${aliceSlug}/nonexistent.html`);
    assert.equal(missingRes.status, 404);
  });

  it('6. Ownership, Versioning & Rollback: blocks User B, updates to v2, and rolls back to v1', async () => {
    // User B cannot delete or modify Alice's site
    const forbiddenDel = await fetch(`${baseUrl}/api/websites/${aliceSiteId}`, {
      method: 'DELETE',
      headers: {Cookie: userBCookie},
    });
    assert.equal(forbiddenDel.status, 403);

    // Alice publishes v2
    const v2Res = await fetch(`${baseUrl}/api/publish`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Cookie: userACookie},
      body: JSON.stringify({
        websiteId: aliceSiteId,
        name: 'Alice Launch',
        commitNote: 'Update to v2',
        files: [{path: 'index.html', content: '<!doctype html><html><body>Version Two</body></html>'}],
      }),
    });
    assert.equal(v2Res.status, 201);

    const liveV2 = await (await fetch(`${baseUrl}/sites/${aliceSlug}/`)).text();
    assert.ok(liveV2.includes('Version Two'));

    // Rollback to v1
    const rollbackRes = await fetch(`${baseUrl}/api/websites/${aliceSiteId}/rollback`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Cookie: userACookie},
      body: JSON.stringify({versionId: v1Id}),
    });
    assert.equal(rollbackRes.status, 200);

    const liveRolledBack = await (await fetch(`${baseUrl}/sites/${aliceSlug}/`)).text();
    assert.ok(liveRolledBack.includes('Version One'));
  });

  it('7. Website Deletion & Admin Audit: deletes site cleanly and enforces admin permissions', async () => {
    // Non-admin blocked from admin endpoint
    const userAdminTry = await fetch(`${baseUrl}/api/admin/overview`, {headers: {Cookie: userACookie}});
    assert.equal(userAdminTry.status, 403);

    // Seeded admin login
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'admin@weblaunch.dev', password: 'Admin123!'}),
    });
    assert.equal(adminLogin.status, 200);
    adminCookie = (adminLogin.headers.get('set-cookie') || '').split(';')[0];

    const adminRes = await fetch(`${baseUrl}/api/admin/overview`, {headers: {Cookie: adminCookie}});
    assert.equal(adminRes.status, 200);
    const adminJson = (await adminRes.json()) as {auditLogs: Array<{action: string}>};
    assert.ok(adminJson.auditLogs.length > 0);

    // Alice deletes her website
    const delRes = await fetch(`${baseUrl}/api/websites/${aliceSiteId}`, {
      method: 'DELETE',
      headers: {Cookie: userACookie},
    });
    assert.equal(delRes.status, 200);

    const afterDel = await fetch(`${baseUrl}/sites/${aliceSlug}/`);
    assert.equal(afterDel.status, 404);
  });
});
