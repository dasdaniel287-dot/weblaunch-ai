# Security Policy

## Isolation & Untrusted Content Controls

1. **Session Cookie Scoping**: Platform session cookies are strictly scoped to `Path=/api` with `HttpOnly` and `SameSite=Lax`, preventing hosted websites under `/sites/*` from reading authentication cookies.
2. **Sandboxed Preview**: Pre-publish HTML previews run inside `<iframe sandbox="allow-scripts">` without `allow-same-origin`.
3. **Upload Validation & ZIP Bomb Protection**:
   - Disallowed executables and server scripts (`.exe`, `.php`, `.sh`, `.py`, `.bat`, etc.) are rejected.
   - Path traversal (`..`, leading `/`, null bytes, drive prefixes) is blocked.
   - ZIP archives enforce max file count, max single-file size, max uncompressed size, and compression ratio checks (`<= 100:1`).
4. **Security Headers on Hosted Sites**: Public websites are served with `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a strict `Content-Security-Policy`.

## Reporting Vulnerabilities

Please report suspected security issues or hosted site abuse via the platform's Report Abuse form or by opening a private security advisory.
