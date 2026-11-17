# Contributing to WebLaunch AI

1. Fork the repository and create a feature branch.
2. Install dependencies with `npm ci`.
3. Ensure typechecks, tests, and production builds pass before submitting a pull request:
   ```bash
   npm run lint
   npm test
   npm run build
   ```
4. Keep changes modular and preserve existing security invariants in `server/security.ts`.
