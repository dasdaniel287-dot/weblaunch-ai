import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type {NextFunction, Request, Response} from 'express';
import type {DbContext} from '../db.ts';

export const SESSION_COOKIE_NAME = 'weblaunch_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  avatarUrl: string | null;
  quotaBytes: number;
  isGuest: boolean;
  suspended: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionId?: string;
    }
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSessionForUser(ctx: DbContext, userId: string, res: Response): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const sessionId = `ses_${crypto.randomBytes(8).toString('hex')}`;
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  ctx.db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sessionId, userId, tokenHash, expiresAt, now);

  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api',
    maxAge: SESSION_TTL_MS,
  });

  return rawToken;
}

export function clearSession(ctx: DbContext, req: Request, res: Response): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (token) {
    ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  res.clearCookie(SESSION_COOKIE_NAME, {path: '/api'});
}

export function attachAuthUser(ctx: DbContext) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token =
      req.cookies?.[SESSION_COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);

    if (!token) {
      return next();
    }

    const tokenHash = hashToken(token);
    const row = ctx.db
      .prepare(
        `SELECT s.id as session_id, s.expires_at, u.id, u.email, u.name, u.role, u.avatar_url, u.quota_bytes, u.is_guest, u.suspended
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(tokenHash) as
      | {
          session_id: string;
          expires_at: number;
          id: string;
          email: string;
          name: string;
          role: 'user' | 'admin';
          avatar_url: string | null;
          quota_bytes: number;
          is_guest: number;
          suspended: number;
        }
      | undefined;

    if (!row || row.expires_at < Date.now()) {
      if (row) {
        ctx.db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
      }
      return next();
    }

    req.sessionId = row.session_id;
    req.authUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      avatarUrl: row.avatar_url,
      quotaBytes: row.quota_bytes,
      isGuest: Boolean(row.is_guest),
      suspended: Boolean(row.suspended),
    };
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({error: 'Authentication required. Please sign in.'});
    return;
  }
  if (req.authUser.suspended) {
    res.status(403).json({error: 'Your account has been suspended.'});
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({error: 'Authentication required.'});
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({error: 'Administrator privileges required.'});
    return;
  }
  next();
}

export function ensurePublisherSession(ctx: DbContext, req: Request, res: Response): AuthUser {
  if (req.authUser) {
    return req.authUser;
  }

  const now = Date.now();
  const guestId = `usr_guest_${crypto.randomBytes(5).toString('hex')}`;
  const guestEmail = `${guestId}@guest.weblaunch.local`;
  const passwordHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 6);
  const quotaBytes = Number(process.env.DEFAULT_USER_QUOTA_BYTES) || 104857600;

  ctx.db
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, role, quota_bytes, is_guest, created_at, updated_at)
       VALUES (?, ?, 'Guest Publisher', ?, 'user', ?, 1, ?, ?)`,
    )
    .run(guestId, guestEmail, passwordHash, quotaBytes, now, now);

  ctx.db
    .prepare(
      `INSERT INTO storage_usage (user_id, total_bytes, file_count, website_count, updated_at)
       VALUES (?, 0, 0, 0, ?)`,
    )
    .run(guestId, now);

  createSessionForUser(ctx, guestId, res);

  const user: AuthUser = {
    id: guestId,
    email: guestEmail,
    name: 'Guest Publisher',
    role: 'user',
    avatarUrl: null,
    quotaBytes,
    isGuest: true,
    suspended: false,
  };
  req.authUser = user;
  return user;
}
