# Deployment Guide — WebLaunch AI

## 1. Node.js / Cloud Run Deployment

1. Set environment variables from `.env.example` (never commit secrets).
2. Build the Vite frontend:
   ```bash
   npm ci
   npm run build
   ```
3. Start the production server:
   ```bash
   NODE_ENV=production npm start
   ```

## 2. Cloudflare Workers + R2 + D1 Deployment

1. Create the D1 database and R2 bucket:
   ```bash
   npx wrangler d1 create weblaunch-db
   npx wrangler r2 bucket create weblaunch-sites
   ```
2. Update `database_id` in `wrangler.toml` with the ID returned by `wrangler d1 create`.
3. Apply SQL migrations:
   ```bash
   npx wrangler d1 migrations apply weblaunch-db --remote
   ```
4. Build and deploy:
   ```bash
   npm run build
   npx wrangler deploy
   ```
5. For automated GitHub Actions deployment, set repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and repository variable `ENABLE_CLOUDFLARE_DEPLOY=true`.
