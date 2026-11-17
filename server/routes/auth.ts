import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {Router} from 'express';
import type {DbContext} from '../db.ts';
import {clearSession, createSessionForUser, requireAuth} from '../middleware/auth.ts';
import {recalculateUserStorage} from '../publisher.ts';
import {createRateLimiter} from '../security.ts';

export function createAuthRouter(ctx: DbContext): Router {
  const router = Router();
  const authLimiter = createRateLimiter('auth', 30, 60 * 1000);

  router.get('/me', (req, res) => {
    if (!req.authUser) {
      res.json({user: null, googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID)});
      return;
    }

    const usage = recalculateUserStorage(ctx, req.authUser.id);
    const notifications = ctx.db
      .prepare('SELECT id, title, message, type, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(req.authUser.id);

    res.json({
      user: req.authUser,
      usage,
      notifications,
      googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
  });

  router.post('/register', authLimiter, (req, res) => {
    const {email, password, name} = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({error: 'Please enter a valid email address.'});
      return;
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({error: 'Password must be at least 6 characters long.'});
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      res.status(409).json({error: 'An account with this email already exists.'});
      return;
    }

    const now = Date.now();
    const passwordHash = bcrypt.hashSync(password, 10);
    const displayName = (typeof name === 'string' && name.trim()) || normalizedEmail.split('@')[0];

    // If current session is a guest, upgrade their guest account so they keep their published sites
    if (req.authUser?.isGuest) {
      ctx.db
        .prepare(
          `UPDATE users
           SET email = ?, name = ?, password_hash = ?, is_guest = 0, updated_at = ?
           WHERE id = ?`,
        )
        .run(normalizedEmail, displayName, passwordHash, now, req.authUser.id);

      const upgraded = ctx.db
        .prepare('SELECT id, email, name, role, avatar_url, quota_bytes, is_guest, suspended FROM users WHERE id = ?')
        .get(req.authUser.id) as {
          id: string;
          email: string;
          name: string;
          role: 'user' | 'admin';
          avatar_url: string | null;
          quota_bytes: number;
          is_guest: number;
          suspended: number;
        };

      res.status(201).json({
        user: {
          id: upgraded.id,
          email: upgraded.email,
          name: upgraded.name,
          role: upgraded.role,
          avatarUrl: upgraded.avatar_url,
          quotaBytes: upgraded.quota_bytes,
          isGuest: false,
          suspended: Boolean(upgraded.suspended),
        },
      });
      return;
    }

    const userId = `usr_${crypto.randomBytes(6).toString('hex')}`;
    const quotaBytes = Number(process.env.DEFAULT_USER_QUOTA_BYTES) || 104857600;

    ctx.db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, role, avatar_url, quota_bytes, is_guest, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'user', ?, ?, 0, ?, ?)`,
      )
      .run(
        userId,
        normalizedEmail,
        displayName,
        passwordHash,
        '/src/assets/images/avatar_founder_1794934539788.jpg',
        quotaBytes,
        now,
        now,
      );

    ctx.db
      .prepare(
        `INSERT INTO storage_usage (user_id, total_bytes, file_count, website_count, updated_at)
         VALUES (?, 0, 0, 0, ?)`,
      )
      .run(userId, now);

    ctx.db
      .prepare(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
         VALUES (?, ?, 'Welcome to WebLaunch AI', 'Upload an index.html or ZIP archive to publish your first site.', 'info', 0, ?)`,
      )
      .run(`ntf_${crypto.randomBytes(6).toString('hex')}`, userId, now);

    createSessionForUser(ctx, userId, res);

    res.status(201).json({
      user: {
        id: userId,
        email: normalizedEmail,
        name: displayName,
        role: 'user',
        avatarUrl: '/src/assets/images/avatar_founder_1794934539788.jpg',
        quotaBytes,
        isGuest: false,
        suspended: false,
      },
    });
  });

  router.post('/login', authLimiter, (req, res) => {
    const {email, password} = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({error: 'Email and password are required.'});
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const row = ctx.db
      .prepare(
        'SELECT id, email, name, password_hash, role, avatar_url, quota_bytes, is_guest, suspended FROM users WHERE email = ?',
      )
      .get(normalizedEmail) as
      | {
          id: string;
          email: string;
          name: string;
          password_hash: string;
          role: 'user' | 'admin';
          avatar_url: string | null;
          quota_bytes: number;
          is_guest: number;
          suspended: number;
        }
      | undefined;

    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      res.status(401).json({error: 'Invalid email or password.'});
      return;
    }

    if (row.suspended) {
      res.status(403).json({error: 'This account has been suspended by an administrator.'});
      return;
    }

    createSessionForUser(ctx, row.id, res);

    res.json({
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        avatarUrl: row.avatar_url,
        quotaBytes: row.quota_bytes,
        isGuest: Boolean(row.is_guest),
        suspended: Boolean(row.suspended),
      },
    });
  });

  router.post('/logout', (req, res) => {
    clearSession(ctx, req, res);
    res.json({ok: true});
  });

  router.patch('/profile', requireAuth, (req, res) => {
    const {name} = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({error: 'Display name must be at least 2 characters.'});
      return;
    }
    const cleanName = name.trim().slice(0, 64);
    ctx.db
      .prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
      .run(cleanName, Date.now(), req.authUser!.id);

    res.json({user: {...req.authUser!, name: cleanName}});
  });

  router.post('/password-reset/request', authLimiter, (req, res) => {
    const {email} = req.body || {};
    if (!email || typeof email !== 'string') {
      res.status(400).json({error: 'Email is required.'});
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const user = ctx.db.prepare('SELECT id FROM users WHERE email = ? AND is_guest = 0').get(normalizedEmail) as
      | {id: string}
      | undefined;

    if (!user) {
      // Do not leak user existence in production, return neutral message
      res.json({message: 'If an account matches that email, a reset token has been generated.'});
      return;
    }

    const token = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expires = Date.now() + 1000 * 60 * 15; // 15 minutes
    ctx.db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(token, expires, user.id);

    // Since there is no SMTP server configured in this sandbox, return previewResetCode in development
    res.json({
      message: 'Password reset code generated (valid for 15 minutes).',
      previewResetCode: process.env.NODE_ENV !== 'production' ? token : undefined,
    });
  });

  router.post('/password-reset/confirm', authLimiter, (req, res) => {
    const {email, token, newPassword} = req.body || {};
    if (!email || !token || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({error: 'Valid email, reset code, and new password (min 6 chars) are required.'});
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = ctx.db
      .prepare('SELECT id, reset_token, reset_expires FROM users WHERE email = ?')
      .get(normalizedEmail) as {id: string; reset_token: string | null; reset_expires: number | null} | undefined;

    if (!user || !user.reset_token || user.reset_token !== String(token).trim().toUpperCase()) {
      res.status(400).json({error: 'Invalid password reset code.'});
      return;
    }
    if (!user.reset_expires || user.reset_expires < Date.now()) {
      res.status(400).json({error: 'Password reset code has expired.'});
      return;
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    ctx.db
      .prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, updated_at = ? WHERE id = ?')
      .run(passwordHash, Date.now(), user.id);

    res.json({ok: true, message: 'Password updated successfully. You can now sign in.'});
  });

  router.post('/notifications/read', requireAuth, (req, res) => {
    ctx.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ok: true});
  });

  return router;
}
