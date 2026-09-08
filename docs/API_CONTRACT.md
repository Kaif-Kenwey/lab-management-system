# API CONTRACT — read before writing ANY route or page

## Conventions
- Import db: `import { db } from "@/lib/db"`. Import helpers: `import { ok, fail, withAuth, audit, body } from "@/lib/api"`.
- EVERY route handler is wrapped in withAuth: `export async function GET() { return withAuth(async (session) => { ... }) }`. `session` = { userId, orgId, orgSlug, role, email, name }.
- ALWAYS scope queries by `session.orgId`. Role guards passed as 2nd arg: `withAuth(handler, ["ADMIN", "LAB_MANAGER"])`.
- Success: `ok(data)` or `ok(data, 201)`. Error: `fail("message", 400|404|409)`. withAuth auto-catches and returns 500.
- List endpoints accept optional `?q=` (search) and return arrays directly (not wrapped).
- Mutations call `audit(session.orgId, session.userId, "ACTION_NAME", "EntityType", id, {...})`.
- Dynamic routes: `export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; ... }` (Next.js 16: params is a Promise).

## Endpoints (all under /api, all org-scoped)

### GET /api/users            → User[] (id, name, email, role, department, status, createdAt). Roles: ADMIN, LAB_MANAGER
### POST /api/users           {name,email,password,role,department} → 201 User. ADMIN only. Unique email → 409.
### PATCH /api/users/[id]     {role?,status?,name?,department?} → User. ADMIN only.
### DELETE /api/users/[id]    → {success}. ADMIN only. Prevent self-delete.

### GET /api/labs             → Lab[] incl. manager{name}, _count.equipment
### POST /api/labs            {name,code,location?,capacity,description?,managerId?} → 201 Lab. Roles: ADMIN, LAB_MANAGER
### GET /api/labs/[id]        → Lab incl. manager, equipment[], inventoryItems[], chemicals[], sessions[]
### PATCH /api/labs/[id]      partial fields → Lab. Roles: ADMIN, LAB_MANAGER
### DELETE /api/labs/[id]     → {success}. ADMIN only.

### GET /api/equipment        → Equipment[] incl. lab{name,code}. Filters: ?labId= ?status= ?q=
### POST /api/equipment       {name,code,labId,category?,manufacturer?,serialNumber?,price?,purchaseDate?,condition?} → 201 Equipment (qrToken auto)
### GET /api/equipment/[id]   → Equipment incl. lab, reservations, checkouts, maintenanceRecords
### PATCH /api/equipment/[id] partial → Equipment. Roles: ADMIN, LAB_MANAGER, TECHNICIAN
### DELETE /api/equipment/[id] → {success}. ADMIN only.

### GET /api/reservations     → Reservation[] incl. equipment{name,code}, user{name}. Filters: ?status= ?equipmentId=
### POST /api/reservations    {equipmentId,startAt,endAt,purpose?} → 201. CONFLICT CHECK: overlapping APPROVED|PENDING reservation for same equipment → 409 {error:"...overlaps..."}.
### PATCH /api/reservations/[id] {status} → Reservation. Approve/reject: APPROVER_ROLES (ADMIN, LAB_MANAGER). Cancel: owner or approvers.

### GET /api/checkouts        → Checkout[] incl. equipment{name,code}, user{name}. Overdue = status ACTIVE && dueAt < now (compute in UI too)
### POST /api/checkouts       {equipmentId,userId,dueAt,conditionOut?,notes?} → 201. Sets equipment.status="IN_USE". Reject if equipment not AVAILABLE.
### PATCH /api/checkouts/[id] {checkedIn:true,conditionIn?} → sets checkedInAt=now, status="RETURNED", equipment.status="AVAILABLE". Also auto-mark overdue: any GET can leave status as-is (UI computes overdue badge).

### GET /api/inventory        → InventoryItem[] incl. lab{name,code}. ?q= ?lowStock=true (quantity <= minQuantity)
### POST /api/inventory       {name,sku,labId,category?,quantity,unit?,minQuantity?,location?} → 201
### PATCH /api/inventory/[id] partial (incl. quantity adjustments) → item
### DELETE /api/inventory/[id] → {success}

### GET /api/chemicals        → Chemical[] incl. lab{name,code}. ?q= ?hazardClass=
### POST /api/chemicals       {name,labId,casNumber?,quantity,unit?,hazardClass?,expiryDate?,storageLocation?} → 201
### PATCH /api/chemicals/[id] partial → chemical
### DELETE /api/chemicals/[id] → {success}

### GET /api/maintenance      → MaintenanceRecord[] incl. equipment{name,code}, technician{name}. ?status= ?equipmentId=
### POST /api/maintenance     {equipmentId,type,scheduledAt,technicianId?,cost?,notes?} → 201; if equipment exists set status="UNDER_MAINTENANCE" when creating with status SCHEDULED? NO — only when PATCH sets status IN_PROGRESS set equipment UNDER_MAINTENANCE; on COMPLETED set equipment AVAILABLE + completedAt=now. Roles: ADMIN, LAB_MANAGER, TECHNICIAN
### PATCH /api/maintenance/[id] {status?,...} → record + equipment status sync (above)

### GET /api/experiments      → Experiment[] incl. lab{name,code}, instructor{name}, _count.sessions
### POST /api/experiments     {title,code,labId,description?,instructorId?} → 201. Roles: ADMIN, LAB_MANAGER, INSTRUCTOR
### PATCH /api/experiments/[id] partial → experiment
### DELETE /api/experiments/[id] → {success}

### GET /api/sessions         → LabSession[] incl. experiment{title,code}, lab{name}, instructor{name}, attendance[]
### POST /api/sessions        {experimentId,title,scheduledAt,durationMin?,room?,labId?,instructorId?} → 201
### PATCH /api/sessions/[id]  {status?...} → session
### POST /api/sessions/[id]/attendance  {records:[{studentName,userId?,status}]} → replace-all semantics: delete session's attendance then createMany. Roles: ADMIN, LAB_MANAGER, INSTRUCTOR

### GET /api/incidents        → Incident[] incl. lab{name,code}, reportedBy{name}. ?status= ?severity=
### POST /api/incidents       {title,labId,description?,severity?,occurredAt?} → 201 (reportedById = session.userId)
### PATCH /api/incidents/[id] {status?,severity?} → incident. Roles: ADMIN, LAB_MANAGER, TECHNICIAN, INSTRUCTOR

### GET /api/vendors          → Vendor[]
### POST /api/vendors         {name,contactEmail?,phone?,address?,category?,rating?} → 201. Roles: ADMIN, LAB_MANAGER
### PATCH /api/vendors/[id]   partial → vendor
### DELETE /api/vendors/[id]  → {success}. ADMIN only.

### GET /api/purchases        → PurchaseRequest[] incl. vendor{name}, requestedBy{name}. ?status=
### POST /api/purchases       {itemName,quantity?,estimatedCost?,vendorId?,justification?} → 201 (status SUBMITTED, requestedById = session.userId)
### PATCH /api/purchases/[id] {status} → APPROVED/REJECTED: ADMIN, LAB_MANAGER only. ORDERED/RECEIVED: + TECHNICIAN.

### GET /api/notifications    → Notification[] (session.userId's OR org-wide where userId null), newest first, take 20
### PATCH /api/notifications  {markAllRead:true} or /api/notifications/[id] {read:true}

### GET /api/dashboard        → { stats: {labs, equipment, availableEquipment, underMaintenance, activeCheckouts, overdueCheckouts, pendingReservations, lowStockItems, openIncidents, members}, byCategory: [{category,count}], utilization: [{name, value}] (top 5 labs by equipment count), upcoming: [next 5 sessions incl. experiment], recentAudit: [5 latest incl. user{name}] }

### GET /api/audit            → AuditLog[] incl. user{name,email}, newest first, take 100. Roles: ADMIN, LAB_MANAGER. Filter: ?q=

## Frontend page pattern (client components)
```tsx
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
// fetch helper:
const res = await fetch("/api/labs");
if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
return res.json();
// mutate → invalidate query key → toast({title:"Created"})
```
- Wrap lists in Card > Table (shadcn) inside `overflow-x-auto`; page uses `<PageHeader>` + optional StatCards.
- Statuses rendered via `<StatusBadge status={...} />`. Dates via date-fns `format(new Date(x), "PPP p")` or "PP".
- Long lists: container `max-h-96 overflow-y-auto`.
- Money: `₹${Number(x).toLocaleString("en-IN")}`.
- Create/Edit dialogs: shadcn Dialog + react-hook-form optional (simple controlled state OK).
- Require QueryClientProvider? The (app) layout does NOT have one — each page creates its own via useState(() => new QueryClient()) inside a small `<Providers>` per page, OR import { QueryClient, QueryClientProvider } locally. Simplest: const [qc] = useState(() => new QueryClient()).
