# LabVault — Lab Management System

A production-grade, **multi-tenant laboratory management platform** built with a modern, in-demand stack. LabVault unifies equipment lifecycle, reservations, inventory, chemical safety, maintenance scheduling, academic sessions, incident reporting and procurement behind role-based access control (RBAC) and a complete audit trail.

> **Demo logins** (password for all: `Password@123`)
> `admin@labvault.io` (Admin) · `manager@labvault.io` (Lab Manager) · `instructor@labvault.io` (Instructor) · `tech@labvault.io` (Technician) · `student@labvault.io` (Student)

---

## ✨ Features

### Modules (14)
| Module | Capabilities |
|---|---|
| **Dashboard** | Live KPIs, equipment-by-category chart, lab utilization chart, overdue & low-stock alerts, upcoming sessions, recent activity feed |
| **Labs** | CRUD, capacity/status/manager, per-lab detail with equipment, inventory and session tabs |
| **Equipment** | Full lifecycle (AVAILABLE → IN_USE → UNDER_MAINTENANCE → RETIRED), condition tracking, valuation, **QR code labels** (print-ready) |
| **Reservations** | Conflict-aware booking (server-side overlap detection → 409), approval workflow (PENDING → APPROVED/REJECTED/CANCELLED/COMPLETED) |
| **Checkouts** | Check-out / check-in workflow, due dates, overdue detection, condition capture |
| **Inventory** | Stock levels, minimum thresholds, low-stock warnings, ± quantity adjustments |
| **Chemicals** | CAS registry numbers, hazard classes (flammable/corrosive/toxic/reactive), expiry monitoring |
| **Maintenance** | Preventive / corrective / calibration jobs with equipment status sync (IN_PROGRESS → equipment UNDER_MAINTENANCE; COMPLETED → AVAILABLE) |
| **Academics** | Experiments, lab sessions, attendance marking (bulk replace-all semantics) |
| **Incidents** | Severity-tagged safety reports (LOW → CRITICAL) with OPEN → INVESTIGATING → RESOLVED flow |
| **Procurement** | Vendor directory + purchase requests with role-gated approvals (SUBMITTED → APPROVED → ORDERED → RECEIVED) |
| **Reports** | Utilization and inventory-health analytics |
| **Audit Log** | Immutable trail of every consequential action, searchable (Admin/Manager only) |
| **Settings** | Profile & organization overview |

### Platform
- 🔐 **Authentication** — email/password with bcrypt hashing, JWT sessions (jose, HS256) in httpOnly cookies, 7-day expiry
- 👥 **RBAC** — 5 roles (ADMIN, LAB_MANAGER, INSTRUCTOR, TECHNICIAN, STUDENT) enforced **server-side** on every endpoint via a `withAuth(handler, roles)` guard
- 🏢 **Multi-tenant** — every record is scoped by `organizationId`; users sign up to their own isolated workspace
- 📱 **Responsive** — mobile-first UI with collapsible sidebar, dark mode support
- 🧾 **Audit trail** — mutations write structured audit entries (actor, action, entity, metadata)
- 🌱 **Seed data** — realistic demo institution: 4 labs, 14 equipment items, chemicals, maintenance jobs, sessions, incidents, vendors

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, React 19, Server Components) |
| Language | **TypeScript 5** (strict) |
| Database | **SQLite** + **Prisma ORM** (16 models) |
| Styling | **Tailwind CSS 4** + **shadcn/ui** (New York) + Lucide icons |
| State | **TanStack Query v5** (server state), Zustand-ready |
| Auth | **jose** (JWT) + **bcryptjs**, httpOnly cookie sessions |
| Charts | **Recharts** |
| QR codes | **qrcode** |

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
bun install        # or: npm install

# 2. Configure environment
cp .env.example .env

# 3. Create the database schema
bunx prisma db push

# 4. Seed demo data
bun prisma/seed.ts

# 5. Run
bun run dev        # http://localhost:3000
```

### Environment variables (`.env`)
```env
DATABASE_URL="file:./db/custom.db"
JWT_SECRET="change-me-in-production"
```

---

## 📐 Architecture

```
src/
├── app/
│   ├── (auth)/            # Login / Register (split-screen brand layout)
│   ├── (app)/             # Authenticated shell (sidebar + topbar) — 14 module pages
│   ├── api/               # REST API — 30 route files, all withAuth-guarded & org-scoped
│   │   ├── auth/          # signup, login, logout, me
│   │   ├── labs/ equipment/ reservations/ checkouts/
│   │   ├── inventory/ chemicals/ maintenance/
│   │   ├── experiments/ sessions/ (incl. attendance)
│   │   ├── incidents/ vendors/ purchases/ users/
│   │   ├── dashboard/ audit/ notifications/
│   └── page.tsx           # Public marketing landing
├── components/
│   ├── ui/                # shadcn/ui primitives
│   ├── shared/            # PageHeader, StatCard, StatusBadge, EmptyState
│   ├── app-sidebar.tsx    # Role-filtered navigation (14 items)
│   ├── topbar.tsx         # Theme toggle, user menu, logout
│   └── app-shell.tsx
├── lib/
│   ├── auth.ts            # JWT sign/verify, bcrypt, cookie session
│   ├── api.ts             # withAuth guard, ok/fail/body, audit() helper
│   ├── constants.ts       # Roles, statuses, categories (single source of truth)
│   └── db.ts              # Prisma client singleton
prisma/
├── schema.prisma          # 16-model multi-tenant schema
└── seed.ts                # Idempotent demo seed
```

### API conventions
- Every handler: `withAuth(async (session) => ok(data), roles?)` — auth, role guard, org scoping and error handling in one place
- Errors: `{ error: string }` with proper status codes (400 validation, 401 unauthenticated, 403 forbidden, 404 missing, 409 conflict/duplicate)
- Mutations write to the audit trail via `audit(orgId, userId, ACTION, EntityType, id, metadata)`

See [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) for the full endpoint reference.

---

## 🔒 Security notes
- Passwords are never stored in plain text (bcrypt, cost 10)
- Session JWTs are httpOnly + SameSite=Lax — not readable from client JS
- All queries are organization-scoped server-side; the UI never trusts the client for authorization
- Set a strong `JWT_SECRET` in production

## 👥 Contributors
- **Kaif Kenwey** — [@Kaif-Kenwey](https://github.com/Kaif-Kenwey)
- **Shyamali Samant** — [@ShyamaliSamant](https://github.com/ShyamaliSamant) (original repository)

## 📄 License
MIT — see [LICENSE](LICENSE)
