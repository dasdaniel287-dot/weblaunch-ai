import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {createExpressApp} from './server/app.ts';
import {initDatabase} from './server/db.ts';

dotenv.config();

async function startServer() {
  const ctx = initDatabase();
  const app = createExpressApp(ctx);
  const httpServer = http.createServer(app);
  const port = Number(process.env.APP_PORT) || 3000;

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/sites')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const {createServer: createViteServer} = await import('vite');
    const hmrEnabled = process.env.DISABLE_HMR !== 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: hmrEnabled ? {server: httpServer} : false,
        hmr: hmrEnabled,
      },
      appType: 'spa',
    });

    if (!hmrEnabled) {
      app.get('/@vite/client', async (_req, res, next) => {
        try {
          const result = await vite.transformRequest('/@vite/client');
          if (!result) {
            return next();
          }
          const patched = result.code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR WebSocket disabled via DISABLE_HMR=true */',
          );
          res.status(200).set({'Content-Type': 'application/javascript; charset=utf-8'}).send(patched);
        } catch (err) {
          next(err);
        }
      });
    }

    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/sites')) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({'Content-Type': 'text/html'}).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`WebLaunch AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start WebLaunch AI server:', err);
  process.exit(1);
});
