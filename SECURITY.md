# Security Policy

## Supported versions
| Version | Supported |
|---|---|
| main branch | ✅ |

## Reporting a vulnerability
Please **do not** open a public issue for security vulnerabilities.
Email the repository owner via GitHub (Koif-Kenwey) or open a **private** security advisory under the *Security* tab.

Include: description, impact, reproduction steps, and any proof-of-concept.

## Security architecture summary
- **Authentication** — email/password, bcrypt (cost 10), JWT (HS256 via jose) in httpOnly, SameSite-aware cookies (None+Secure behind HTTPS for iframe deployments, Lax locally), 7-day expiry
- **Authorization** — role + granular permission matrix enforced **server-side** in every route handler (`withPermission`); the frontend is never a security boundary
- **Tenancy** — every query derives `organizationId` from the authenticated session; cross-tenant reads return 404 (no existence leaks)
- **Input validation** — Zod schemas on all mutating endpoints; typed error envelope `{error:{code,message,requestId}}`; no stack traces in responses
- **Rate limiting** — sliding-window limiter on authentication endpoints (429 `RATE_LIMITED`)
- **Uploads** — MIME allowlist + size cap + magic-byte checks; stored outside the web root with random names; never executed
- **Headers** — X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control (framing kept open for sandbox preview; enable `X-Frame-Options: DENY` + strict CSP in production)

## Known limitations (documented, by design for the demo)
- In-memory rate limiting is per-process; use Redis/edge middleware for multi-instance production
- JWT revocation requires a token store (not implemented); keep expiry short in production
- Password-reset tokens are returned in the API response when no email provider is configured (**demo mode only**)
