import cookieParser from 'cookie-parser';
import express from 'express';
import type {DbContext} from './db.ts';
import {attachAuthUser} from './middleware/auth.ts';
import {createAdminRouter} from './routes/admin.ts';
import {createAuthRouter} from './routes/auth.ts';
import {createDomainsRouter} from './routes/domains.ts';
import {createPublicSiteRouter} from './routes/publicSite.ts';
import {createWebsitesRouter} from './routes/websites.ts';

export function createExpressApp(ctx: DbContext): express.Express {
  const app = express();

  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json({limit: '25mb'}));
  app.use(express.urlencoded({extended: true, limit: '25mb'}));

  // Public Website Routing Engine — isolated from /api auth cookies
  app.use('/sites', createPublicSiteRouter(ctx));

  // API Routes
  app.use('/api', attachAuthUser(ctx));
  app.get('/api/health', (_req, res) => {
    res.json({status: 'ok', service: 'weblaunch-ai', timestamp: Date.now()});
  });

  app.use('/api/auth', createAuthRouter(ctx));
  app.use('/api/domains', createDomainsRouter(ctx));
  app.use('/api/admin', createAdminRouter(ctx));
  app.use('/api', createWebsitesRouter(ctx));

  app.use('/api/*', (_req, res) => {
    res.status(404).json({error: 'API endpoint not found.'});
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({error: message});
  });

  return app;
}
