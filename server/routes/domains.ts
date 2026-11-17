import crypto from 'crypto';
import dns from 'dns/promises';
import {Router} from 'express';
import type {DbContext} from '../db.ts';
import {requireAuth} from '../middleware/auth.ts';

const DOMAIN_REGEX = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;

export function createDomainsRouter(ctx: DbContext): Router {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    const domains = ctx.db
      .prepare(
        `SELECT cd.*, w.name as website_name, w.slug as website_slug
         FROM custom_domains cd
         JOIN websites w ON w.id = cd.website_id
         WHERE cd.user_id = ?
         ORDER BY cd.created_at DESC`,
      )
      .all(req.authUser!.id);
    res.json({domains});
  });

  router.post('/', requireAuth, (req, res) => {
    const {websiteId, domain} = req.body || {};
    if (!websiteId || !domain || typeof domain !== 'string') {
      res.status(400).json({error: 'Website and domain name are required.'});
      return;
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!DOMAIN_REGEX.test(cleanDomain)) {
      res.status(400).json({error: 'Please enter a valid domain name (e.g. docs.example.com).'});
      return;
    }

    const site = ctx.db
      .prepare('SELECT id, user_id FROM websites WHERE id = ?')
      .get(websiteId) as {id: string; user_id: string} | undefined;

    if (!site || site.user_id !== req.authUser!.id) {
      res.status(403).json({error: 'You can only attach domains to websites you own.'});
      return;
    }

    const existing = ctx.db.prepare('SELECT id FROM custom_domains WHERE domain = ?').get(cleanDomain);
    if (existing) {
      res.status(409).json({error: 'This domain is already registered on the platform.'});
      return;
    }

    const id = `dom_${crypto.randomBytes(6).toString('hex')}`;
    const verificationToken = `weblaunch-verify=${crypto.randomBytes(12).toString('hex')}`;
    const now = Date.now();

    ctx.db
      .prepare(
        `INSERT INTO custom_domains (id, website_id, user_id, domain, verification_token, dns_verified, ssl_status, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
      )
      .run(id, site.id, req.authUser!.id, cleanDomain, verificationToken, now);

    const created = ctx.db
      .prepare(
        `SELECT cd.*, w.name as website_name, w.slug as website_slug
         FROM custom_domains cd
         JOIN websites w ON w.id = cd.website_id
         WHERE cd.id = ?`,
      )
      .get(id);

    res.status(201).json({domain: created});
  });

  // Real DNS TXT verification lookup — never fakes verification
  router.post('/:id/verify', requireAuth, async (req, res) => {
    const record = ctx.db
      .prepare('SELECT * FROM custom_domains WHERE id = ?')
      .get(req.params.id) as
      | {
          id: string;
          user_id: string;
          domain: string;
          verification_token: string;
        }
      | undefined;

    if (!record) {
      res.status(404).json({error: 'Domain record not found.'});
      return;
    }
    if (record.user_id !== req.authUser!.id) {
      res.status(403).json({error: 'Access denied.'});
      return;
    }

    const now = Date.now();
    const txtHost = `_weblaunch.${record.domain}`;
    let verified = false;
    let errorMessage = '';

    try {
      const txtRecords = await dns.resolveTxt(txtHost);
      const flattened = txtRecords.flat().map((s) => s.trim());
      if (flattened.includes(record.verification_token)) {
        verified = true;
      } else {
        errorMessage = `TXT record found at ${txtHost}, but it does not contain "${record.verification_token}".`;
      }
    } catch {
      errorMessage = `No TXT record found at ${txtHost}. Add the TXT record at your DNS provider and allow propagation before verifying.`;
    }

    ctx.db
      .prepare(
        `UPDATE custom_domains
         SET dns_verified = ?,
             ssl_status = ?,
             last_checked_at = ?,
             last_error = ?,
             verified_at = CASE WHEN ? = 1 THEN ? ELSE verified_at END
         WHERE id = ?`,
      )
      .run(
        verified ? 1 : 0,
        verified ? 'active' : 'pending',
        now,
        verified ? null : errorMessage,
        verified ? 1 : 0,
        now,
        record.id,
      );

    const updated = ctx.db
      .prepare(
        `SELECT cd.*, w.name as website_name, w.slug as website_slug
         FROM custom_domains cd
         JOIN websites w ON w.id = cd.website_id
         WHERE cd.id = ?`,
      )
      .get(record.id);

    res.json({
      verified,
      message: verified ? 'DNS verified and SSL configuration ready.' : errorMessage,
      domain: updated,
    });
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const record = ctx.db
      .prepare('SELECT id, user_id FROM custom_domains WHERE id = ?')
      .get(req.params.id) as {id: string; user_id: string} | undefined;

    if (!record) {
      res.status(404).json({error: 'Domain not found.'});
      return;
    }
    if (record.user_id !== req.authUser!.id) {
      res.status(403).json({error: 'Access denied.'});
      return;
    }

    ctx.db.prepare('DELETE FROM custom_domains WHERE id = ?').run(record.id);
    res.json({ok: true});
  });

  return router;
}
