import crypto from 'crypto';
import {Router} from 'express';
import type {DbContext} from '../db.ts';
import {requireAdmin} from '../middleware/auth.ts';
import {deleteWebsiteById} from '../publisher.ts';

export function createAdminRouter(ctx: DbContext): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/overview', (_req, res) => {
    const users = ctx.db
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.quota_bytes, u.is_guest, u.suspended, u.created_at,
                COALESCE(su.total_bytes, 0) as used_bytes,
                COALESCE(su.website_count, 0) as website_count
         FROM users u
         LEFT JOIN storage_usage su ON su.user_id = u.id
         ORDER BY u.created_at DESC`,
      )
      .all();

    const websites = ctx.db
      .prepare(
        `SELECT w.*, u.email as owner_email, u.name as owner_name
         FROM websites w
         JOIN users u ON u.id = w.user_id
         ORDER BY w.updated_at DESC`,
      )
      .all();

    const reports = ctx.db
      .prepare(
        `SELECT r.*, w.slug as website_slug, w.name as website_name
         FROM abuse_reports r
         JOIN websites w ON w.id = r.website_id
         ORDER BY r.created_at DESC`,
      )
      .all();

    const auditLogs = ctx.db
      .prepare(
        `SELECT a.*, u.email as actor_email
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.created_at DESC
         LIMIT 50`,
      )
      .all();

    const deployments = ctx.db
      .prepare(
        `SELECT d.*, w.name as website_name, w.slug
         FROM deployments d
         JOIN websites w ON w.id = d.website_id
         ORDER BY d.created_at DESC
         LIMIT 30`,
      )
      .all();

    const totalDiskBytes = ctx.storage.getTotalBytes();

    res.json({
      health: {
        database: 'healthy',
        objectStorage: 'healthy',
        totalDiskBytes,
        uptimeSeconds: Math.round(process.uptime()),
      },
      users,
      websites,
      reports,
      auditLogs,
      deployments,
    });
  });

  router.patch('/users/:id', (req, res) => {
    const {suspended, role} = req.body || {};
    const target = ctx.db.prepare('SELECT id, role, suspended FROM users WHERE id = ?').get(req.params.id) as
      | {id: string; role: string; suspended: number}
      | undefined;

    if (!target) {
      res.status(404).json({error: 'User not found.'});
      return;
    }
    if (target.id === req.authUser!.id && suspended === true) {
      res.status(400).json({error: 'Administrators cannot suspend their own account.'});
      return;
    }

    const nextSuspended = typeof suspended === 'boolean' ? (suspended ? 1 : 0) : target.suspended;
    const nextRole = role === 'admin' || role === 'user' ? role : target.role;

    ctx.db
      .prepare('UPDATE users SET suspended = ?, role = ?, updated_at = ? WHERE id = ?')
      .run(nextSuspended, nextRole, Date.now(), target.id);

    ctx.db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, details, ip_address, created_at)
         VALUES (?, ?, 'admin.user_update', 'user', ?, ?, ?, ?)`,
      )
      .run(
        `aud_${crypto.randomBytes(6).toString('hex')}`,
        req.authUser!.id,
        target.id,
        `suspended=${nextSuspended}, role=${nextRole}`,
        req.ip || '',
        Date.now(),
      );

    res.json({ok: true});
  });

  router.patch('/websites/:id', (req, res) => {
    const {status} = req.body || {};
    if (status !== 'active' && status !== 'suspended' && status !== 'unpublished') {
      res.status(400).json({error: 'Invalid website status.'});
      return;
    }

    const site = ctx.db.prepare('SELECT id, slug FROM websites WHERE id = ?').get(req.params.id) as
      | {id: string; slug: string}
      | undefined;
    if (!site) {
      res.status(404).json({error: 'Website not found.'});
      return;
    }

    ctx.db.prepare('UPDATE websites SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), site.id);

    ctx.db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, details, ip_address, created_at)
         VALUES (?, ?, 'admin.website_status', 'website', ?, ?, ?, ?)`,
      )
      .run(
        `aud_${crypto.randomBytes(6).toString('hex')}`,
        req.authUser!.id,
        site.id,
        `Set /sites/${site.slug}/ status=${status}`,
        req.ip || '',
        Date.now(),
      );

    res.json({ok: true});
  });

  router.delete('/websites/:id', (req, res) => {
    try {
      deleteWebsiteById(ctx, req.params.id, req.authUser!.id, true, req.ip || '');
      res.json({ok: true});
    } catch (err) {
      res.status(404).json({error: err instanceof Error ? err.message : 'Website not found.'});
    }
  });

  router.patch('/reports/:id', (req, res) => {
    const {status} = req.body || {};
    if (status !== 'resolved' && status !== 'dismissed' && status !== 'open') {
      res.status(400).json({error: 'Invalid report status.'});
      return;
    }

    ctx.db
      .prepare('UPDATE abuse_reports SET status = ?, resolved_at = ? WHERE id = ?')
      .run(status, status === 'open' ? null : Date.now(), req.params.id);

    res.json({ok: true});
  });

  return router;
}
