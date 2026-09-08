# Security

## Authentication
- Passwords hashed with **bcrypt (cost 10)**; hashes never leave the server (explicit field selects).
- Sessions are **JWTs (HS256, `jose`)** in **httpOnly** cookies — unreadable from client JS. 7-day expiry.
- Cookie flags adapt to deployment: `SameSite=None; Secure` behind HTTPS (safe inside embedded preview iframes), `SameSite=Lax` on plain HTTP local dev.
- Login/signup are rate limited (8/min and 5/min per IP+identity) → `429 RATE_LIMITED`.
- Password reset: single-use SHA-256-hashed token, 30-minute expiry, consumed atomically. When no `EMAIL_PROVIDER` is configured the token is returned in the response **and clearly labelled DEMO MODE** (see limitations).

## Authorization
- **5 roles × 31 granular permissions** (`src/lib/permissions.ts`) enforced **server-side** in every handler via `withAuth(req, handler, "permission.key")`.
- The frontend reads `/api/auth/me` permissions purely for UX (hiding buttons) and is never a boundary.
- Role-gated workflows: procurement approvals, user management, audit visibility, equipment retirement.

## Tenant isolation
- Every query filters `organizationId` **derived from the session** — never from request bodies or URLs.
- Cross-tenant ids return **404 (not 403)** so the existence of another tenant's records never leaks.
- Verified by `tests/integration/tenancy.test.ts` (reads, writes, list leakage, ledger history).

## Input validation & errors
- All mutating endpoints parse bodies with **Zod** schemas; failures return field-scoped `400 VALIDATION_ERROR`.
- Uniform error envelope `{error:{code,message,requestId}}` — codes: `VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RESOURCE_CONFLICT, RATE_LIMITED, INTERNAL_ERROR`. Stack traces and Prisma internals never reach the client.
- Unique-constraint violations map to friendly `409 RESOURCE_CONFLICT` messages.

## Uploads
- Whitelisted MIME types (pdf/png/jpeg/webp/txt/csv/xlsx/docx), **5 MB cap** (413), **magic-byte verification** for pdf/png/jpeg (415), entity-existence + org check before attach.
- Stored as `{uuid}{ext}` under `uploads/{orgId}/` — never executable, served only to authenticated org members via a streaming download endpoint.

## Headers
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
`X-Frame-Options` is intentionally omitted so the app can render inside the sandbox preview iframe — **enable it (DENY) plus a strict CSP for real deployments**.

## Observability for security events
- Structured JSON request logs (requestId, method, path, status, duration, userId, orgId).
- Audit trail on every consequential mutation (actor, action, entity, metadata, requestId).
- Failed logins return a generic "Invalid email or password" (no user enumeration); reset endpoints always return 202.

## OWASP Top-10 mapping (highlights)

| Risk | Mitigation |
|---|---|
| A01 Broken Access Control | Server-side permission matrix, org-scoped queries, tenancy tests |
| A02 Cryptographic Failures | bcrypt hashing, signed JWTs, httpOnly cookies, secret via env |
| A03 Injection | Prisma parameterized queries, Zod validation everywhere |
| A04 Insecure Design | Ledger/work-order state machines, transition maps, conflict 409s |
| A05 Security Misconfiguration | Security headers, no default secrets (env required), error envelope |
| A06 Vulnerable Dependencies | Lockfile + CI install step; `bun pm audit` recommended pre-release |
| A07 Auth Failures | Rate limiting, generic errors, single-use reset tokens, suspended-account gate |
| A08 Data Integrity | DB transactions, append-only ledger/events, transition maps |
| A09 Logging Failures | Structured request logs + audit trail with requestIds |
| A10 SSRF | No outbound fetches from user input (AI context is server-constructed) |

## Known limitations (documented, demo-scoped)
- Rate limiting is in-memory per process (use Redis/edge middleware for multi-instance).
- JWTs are not revocable without a token store; keep expiry short in production.
- Demo-mode password reset returns the token in the API response (no mailer configured).
