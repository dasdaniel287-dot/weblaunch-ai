# WebLaunch AI — One-Click Website Publishing Platform

**Tagline:** Upload. Publish. Go Live.

WebLaunch AI is an open-source website hosting platform that lets anyone upload a single `index.html`, a full website directory, or a `.zip` archive and publish it live online with an isolated public URL in one click.

## Core Capabilities

- **One-Click Publishing Engine**: Validates file extensions, checks `index.html` presence, enforces archive limits, creates immutable versioned storage namespaces, verifies stored objects, and emits a live public URL (`/sites/<slug>/`).
- **ZIP Extraction & Path Safety**: Protects against ZIP bombs (compression ratio & uncompressed size caps), strips single root folders automatically, and blocks path traversal (`..`, null bytes, absolute paths).
- **Sandboxed Multi-Device Preview**: Inspect uploaded HTML/CSS/JS/images across Desktop, Tablet, and Mobile viewports inside an unprivileged `sandbox="allow-scripts"` iframe before publishing.
- **Version History & Rollback**: Every update creates a versioned snapshot (`v1`, `v2`, ...). Roll back to any prior version or toggle visibility (`active` / `unpublished`) instantly.
- **Custom Domains & DNS Verification**: Register custom domains and run live DNS TXT ownership checks (`_weblaunch.<domain>`).
- **Admin Console & Moderation**: Manage users, monitor storage usage, inspect audit logs, resolve abuse reports, and suspend policy-violating sites.
- **Bilingual & Dual Theme**: Full English and Bengali (`বাংলা`) support with Dark and Light modes.

## Quick Start (Local / Node.js)

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

### Demo Accounts (Seeded Automatically)
- **Creator:** `creator@weblaunch.dev` / `Demo1234!`
- **Admin:** `admin@weblaunch.dev` / `Admin123!`

## Testing

```bash
npm run lint
npm test
npm run build
```

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md)
- [Security Policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
