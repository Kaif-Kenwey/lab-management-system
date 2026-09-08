"use client";

import { useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { addYears, format } from "date-fns";
import {
  BadgeCheck,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  Gauge,
  Loader2,
  PackageOpen,
  Plus,
  TriangleAlert,
  UserCog,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiFetch, apiJson } from "@/lib/client";
import { CALIBRATION_RESULT, MAINTENANCE_PRIORITY, MAINTENANCE_STATUS, MAINTENANCE_TYPE } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

type Me = { session: { userId: string; role: string; name: string }; permissions: string[] };
type WorkOrder = {
  id: string;
  title: string;
  issue?: string | null;
  type: string;
  priority: string;
  status: string;
  scheduledAt: string;
  completedAt?: string | null;
  laborCost?: number | null;
  partsCost?: number | null;
  cost?: number | null;
  equipment?: { name: string; code: string } | null;
  technician?: { name: string } | null;
};
type Equipment = { id: string; name: string; code: string };
type UserRow = { id: string; name: string; role: string };

type CalibrationRecord = {
  id: string;
  standard?: string | null;
  provider?: string | null;
  lastCalibratedAt?: string | null;
  nextDueAt: string;
  result: string;
  status: string;
  deviation?: number | null;
  certificateNumber?: string | null;
  equipment?: { id: string; name: string; code: string } | null;
};
type Compliance = {
  total: number;
  valid: number;
  dueSoon: number;
  overdue: number;
  failed: number;
  compliancePct: number;
};

function money(n: unknown) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
}
function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  try {
    return format(new Date(v), "dd MMM yyyy, HH:mm");
  } catch {
    return "—";
  }
}
function humanize(s: string) {
  return s.replace(/_/g, " ");
}

/** Priority chip: CRITICAL red, HIGH amber, MEDIUM/LOW neutral */
function PriorityBadge({ priority }: { priority: string }) {
  const tone =
    priority === "CRITICAL"
      ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
      : priority === "HIGH"
        ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900"
        : "bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700";
  return (
    <Badge variant="outline" className={`${tone} font-medium whitespace-nowrap`}>
      {humanize(priority)}
    </Badge>
  );
}

/* ------------------------------- Work orders ------------------------------ */

const emptyWoForm = {
  title: "",
  equipmentId: "none",
  issue: "",
  type: "PREVENTIVE",
  priority: "MEDIUM",
  technicianId: "none",
  scheduledAt: "",
  laborCost: "0",
  partsCost: "0",
  notes: "",
};

function WorkOrdersTab({ canManage }: { canManage: boolean }) {
  const rq = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [assignTech, setAssignTech] = useState("none");
  const [form, setForm] = useState(emptyWoForm);

  const records = useQuery<WorkOrder[]>({
    queryKey: ["maintenance"],
    queryFn: () => apiFetch<WorkOrder[]>("/api/maintenance"),
  });

  const equipment = useQuery<Equipment[]>({
    queryKey: ["equipment"],
    queryFn: () => apiFetch<Equipment[]>("/api/equipment"),
  });
  const users = useQuery<UserRow[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserRow[]>("/api/users"),
    retry: false,
  });
  const technicians = (users.data ?? []).filter(
    (u) => u.role === "TECHNICIAN" || u.role === "ADMIN" || u.role === "LAB_MANAGER"
  );

  const all = records.data ?? [];
  const stats = useMemo(
    () => ({
      open: all.filter((r) => r.status === "OPEN").length,
      inProgress: all.filter((r) => r.status === "IN_PROGRESS").length,
      waiting: all.filter((r) => r.status === "WAITING_FOR_PARTS").length,
      completed: all.filter((r) => r.status === "COMPLETED").length,
    }),
    [all]
  );

  const list = all.filter(
    (r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (priorityFilter === "all" || r.priority === priorityFilter)
  );

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiJson<WorkOrder>(`/api/maintenance/${id}`, "PATCH", body),
    onSuccess: (_d, vars) => {
      toast({ title: "Work order updated" });
      setAssignId(null);
      setAssignTech("none");
      rq.invalidateQueries({ queryKey: ["maintenance"] });
      void vars;
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson<WorkOrder>("/api/maintenance", "POST", {
        title: form.title.trim(),
        equipmentId: form.equipmentId,
        issue: form.issue.trim() || undefined,
        type: form.type,
        priority: form.priority,
        technicianId: form.technicianId === "none" ? undefined : form.technicianId,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        laborCost: Number(form.laborCost) || 0,
        partsCost: Number(form.partsCost) || 0,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Work order created" });
      setCreateOpen(false);
      setForm(emptyWoForm);
      rq.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not create work order", description: e.message, variant: "destructive" }),
  });

  const assignRecord = all.find((r) => r.id === assignId);

  function actions(r: WorkOrder) {
    if (!canManage) return null;
    const busy = patch.isPending;
    switch (r.status) {
      case "OPEN":
      case "ASSIGNED":
        return (
          <div className="flex items-center justify-end gap-1.5">
            {r.status === "OPEN" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={busy}
                onClick={() => {
                  setAssignTech("none");
                  setAssignId(r.id);
                }}
              >
                <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                Assign
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
              disabled={busy}
              onClick={() => patch.mutate({ id: r.id, body: { status: "IN_PROGRESS" } })}
            >
              <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
              Start
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-red-600 hover:text-red-700 dark:text-red-400"
              disabled={busy}
              aria-label={`Cancel work order ${r.title}`}
              onClick={() => patch.mutate({ id: r.id, body: { status: "CANCELLED" } })}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        );
      case "IN_PROGRESS":
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => patch.mutate({ id: r.id, body: { status: "WAITING_FOR_PARTS" } })}>
              <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Wait parts
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
              disabled={busy}
              onClick={() => patch.mutate({ id: r.id, body: { status: "COMPLETED" } })}
            >
              <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Complete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-red-600 hover:text-red-700 dark:text-red-400"
              disabled={busy}
              aria-label={`Cancel work order ${r.title}`}
              onClick={() => patch.mutate({ id: r.id, body: { status: "CANCELLED" } })}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        );
      case "WAITING_FOR_PARTS":
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => patch.mutate({ id: r.id, body: { status: "IN_PROGRESS" } })}>
              <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
              Resume
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-red-600 hover:text-red-700 dark:text-red-400"
              disabled={busy}
              aria-label={`Cancel work order ${r.title}`}
              onClick={() => patch.mutate({ id: r.id, body: { status: "CANCELLED" } })}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        );
      default:
        return <span className="text-xs text-muted-foreground">—</span>;
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Open" value={stats.open} icon={Wrench} />
        <StatCard title="In progress" value={stats.inProgress} icon={CircleDashed} />
        <StatCard title="Waiting parts" value={stats.waiting} icon={PackageOpen} />
        <StatCard title="Completed" value={stats.completed} icon={CircleCheck} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Work orders</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-44" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {MAINTENANCE_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="sm:w-40" aria-label="Filter by priority">
                <SelectValue placeholder="All priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {MAINTENANCE_PRIORITY.map((p) => (
                  <SelectItem key={p} value={p}>
                    {humanize(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                New work order
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {records.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : records.isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load work orders"
                description={records.error instanceof Error ? records.error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => records.refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Wrench}
                title="No work orders"
                description="Create a work order to track repair and calibration jobs."
              />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cost</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-48">
                        <span className="block truncate" title={r.title}>
                          {r.title}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.equipment?.name ?? "—"}
                        {r.equipment?.code ? (
                          <span className="block font-mono text-xs text-muted-foreground">{r.equipment.code}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{humanize(r.type)}</TableCell>
                      <TableCell>
                        <PriorityBadge priority={r.priority} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.technician?.name ?? "Unassigned"}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDateTime(r.scheduledAt)}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{money(r.cost)}</TableCell>
                      {canManage ? <TableCell>{actions(r)}</TableCell> : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create work order */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New work order</DialogTitle>
            <DialogDescription>Raise a maintenance job for a piece of equipment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="wo-title">Title</Label>
              <Input
                id="wo-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Replace worn drive belt"
              />
            </div>
            <div className="grid gap-2">
              <Label>Equipment</Label>
              <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem disabled value="none">
                    Select equipment
                  </SelectItem>
                  {(equipment.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({e.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wo-issue">Issue</Label>
              <Textarea
                id="wo-issue"
                rows={2}
                value={form.issue}
                onChange={(e) => setForm({ ...form, issue: e.target.value })}
                placeholder="Describe the fault or the work required"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_TYPE.map((t) => (
                      <SelectItem key={t} value={t}>
                        {humanize(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_PRIORITY.map((p) => (
                      <SelectItem key={p} value={p}>
                        {humanize(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Technician</Label>
                <Select value={form.technicianId} onValueChange={(v) => setForm({ ...form, technicianId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wo-when">Scheduled at</Label>
                <Input
                  id="wo-when"
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="wo-labor">Labor cost (₹)</Label>
                <Input
                  id="wo-labor"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.laborCost}
                  onChange={(e) => setForm({ ...form, laborCost: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wo-parts">Parts cost (₹)</Label>
                <Input
                  id="wo-parts"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.partsCost}
                  onChange={(e) => setForm({ ...form, partsCost: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wo-notes">Notes</Label>
              <Textarea
                id="wo-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={
                create.isPending || !form.title.trim() || form.equipmentId === "none" || !form.scheduledAt
              }
            >
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Create work order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign technician dialog */}
      <Dialog open={!!assignId} onOpenChange={(o) => !o && setAssignId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign technician</DialogTitle>
            <DialogDescription>
              {assignRecord ? `${assignRecord.title} — ${assignRecord.equipment?.name ?? ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Technician</Label>
            <Select value={assignTech} onValueChange={setAssignTech}>
              <SelectTrigger>
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem disabled value="none">
                  Select technician
                </SelectItem>
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignId(null)} disabled={patch.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                assignId && assignTech !== "none"
                  ? patch.mutate({ id: assignId, body: { technicianId: assignTech, status: "ASSIGNED" } })
                  : undefined
              }
              disabled={patch.isPending || assignTech === "none"}
            >
              {patch.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- Calibration ------------------------------ */

const emptyCalForm = {
  equipmentId: "none",
  standard: "",
  provider: "",
  lastCalibratedAt: "",
  nextDueAt: "",
  result: "PASS",
  deviation: "",
  certificateNumber: "",
  notes: "",
};

function CalibrationTab({ canManage }: { canManage: boolean }) {
  const rq = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCalForm);

  const equipment = useQuery<Equipment[]>({
    queryKey: ["equipment"],
    queryFn: () => apiFetch<Equipment[]>("/api/equipment"),
  });

  const records = useQuery<CalibrationRecord[]>({
    queryKey: ["calibration"],
    queryFn: () => apiFetch<CalibrationRecord[]>("/api/calibration"),
  });

  // Compliance endpoint (Phase 11). If unavailable, derive the same numbers
  // client-side from the records list so the card still works.
  const compliance = useQuery<Compliance>({
    queryKey: ["calibration-compliance", records.data],
    queryFn: async () => {
      try {
        return await apiFetch<Compliance>("/api/calibration/compliance");
      } catch {
        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const list = records.data ?? [];
        const c: Compliance = { total: list.length, valid: 0, dueSoon: 0, overdue: 0, failed: 0, compliancePct: 0 };
        for (const r of list) {
          if (r.result === "FAIL") c.failed += 1;
          else if (new Date(r.nextDueAt) < now) c.overdue += 1;
          else if (new Date(r.nextDueAt) < soon) c.dueSoon += 1;
          else c.valid += 1;
        }
        c.compliancePct = c.total ? Math.round((c.valid / c.total) * 1000) / 10 : 0;
        return c;
      }
    },
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson<CalibrationRecord>("/api/calibration", "POST", {
        equipmentId: form.equipmentId,
        standard: form.standard.trim() || undefined,
        provider: form.provider.trim() || undefined,
        lastCalibratedAt: form.lastCalibratedAt || undefined,
        nextDueAt: form.nextDueAt,
        result: form.result,
        deviation: form.deviation === "" ? undefined : Number(form.deviation),
        certificateNumber: form.certificateNumber.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Calibration recorded" });
      setOpen(false);
      setForm(emptyCalForm);
      rq.invalidateQueries({ queryKey: ["calibration"] });
      rq.invalidateQueries({ queryKey: ["calibration-compliance"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not record calibration", description: e.message, variant: "destructive" }),
  });

  const complete = useMutation({
    mutationFn: (r: CalibrationRecord) =>
      apiJson<CalibrationRecord>(`/api/calibration/${r.id}`, "PATCH", {
        result: "PASS",
        lastCalibratedAt: new Date().toISOString(),
        nextDueAt: addYears(new Date(), 1).toISOString(),
      }),
    onSuccess: () => {
      toast({ title: "Calibration completed", description: "Next due date set one year out." });
      rq.invalidateQueries({ queryKey: ["calibration"] });
      rq.invalidateQueries({ queryKey: ["calibration-compliance"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not complete calibration", description: e.message, variant: "destructive" }),
  });

  const comp = compliance.data;
  const list = records.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Calibration compliance</CardTitle>
            <CardDescription>Share of instruments with a valid calibration.</CardDescription>
          </div>
          {canManage ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Record calibration
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {compliance.isLoading || !comp ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold tracking-tight">{comp.compliancePct}%</div>
                <Gauge className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
                  {comp.valid} valid
                </Badge>
                <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900">
                  {comp.dueSoon} due soon
                </Badge>
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900">
                  {comp.overdue} overdue
                </Badge>
                <Badge variant="outline" className="bg-neutral-200 text-neutral-600 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700">
                  {comp.failed} failed
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calibration records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : records.isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load calibration records"
                description={records.error instanceof Error ? records.error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => records.refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Gauge}
                title="No calibration records"
                description="Record calibrations to track instrument compliance."
              />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Standard</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Last calibrated</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Certificate</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.equipment?.name ?? "—"}
                        {r.equipment?.code ? (
                          <span className="block font-mono text-xs text-muted-foreground">{r.equipment.code}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.standard ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.provider ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {r.lastCalibratedAt ? format(new Date(r.lastCalibratedAt), "PP") : "—"}
                      </TableCell>
                      <TableCell
                        className={`whitespace-nowrap ${r.status === "OVERDUE" ? "font-medium text-red-600 dark:text-red-400" : ""}`}
                      >
                        {format(new Date(r.nextDueAt), "PP")}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.result} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.certificateNumber ?? "—"}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end">
                            {r.status !== "VALID" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                                disabled={complete.isPending}
                                onClick={() => complete.mutate(r)}
                              >
                                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Complete
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record calibration dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record calibration</DialogTitle>
            <DialogDescription>Log a calibration run and the next due date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Equipment</Label>
              <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem disabled value="none">
                    Select equipment
                  </SelectItem>
                  {(equipment.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({e.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cal-standard">Standard</Label>
                <Input
                  id="cal-standard"
                  value={form.standard}
                  onChange={(e) => setForm({ ...form, standard: e.target.value })}
                  placeholder="ISO 17025 traceable"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cal-provider">Provider</Label>
                <Input
                  id="cal-provider"
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  placeholder="CalLab Services"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cal-last">Last calibrated</Label>
                <Input
                  id="cal-last"
                  type="date"
                  value={form.lastCalibratedAt}
                  onChange={(e) => setForm({ ...form, lastCalibratedAt: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cal-next">Next due</Label>
                <Input
                  id="cal-next"
                  type="date"
                  value={form.nextDueAt}
                  onChange={(e) => setForm({ ...form, nextDueAt: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Result</Label>
                <Select value={form.result} onValueChange={(v) => setForm({ ...form, result: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALIBRATION_RESULT.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cal-dev">Deviation</Label>
                <Input
                  id="cal-dev"
                  type="number"
                  step="0.01"
                  value={form.deviation}
                  onChange={(e) => setForm({ ...form, deviation: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cal-cert">Certificate</Label>
                <Input
                  id="cal-cert"
                  value={form.certificateNumber}
                  onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
                  placeholder="CERT-2024-001"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cal-notes">Notes</Label>
              <Textarea
                id="cal-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Observations, reference readings..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || form.equipmentId === "none" || !form.nextDueAt}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --------------------------------- Wrapper -------------------------------- */

function MaintenanceContent() {
  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });
  const canManage = (me.data?.permissions ?? []).includes("maintenance.manage");

  return (
    <Tabs defaultValue="work-orders" className="space-y-4">
      <TabsList>
        <TabsTrigger value="work-orders" className="gap-2">
          <Wrench className="h-4 w-4" aria-hidden="true" />
          Work Orders
        </TabsTrigger>
        <TabsTrigger value="calibration" className="gap-2">
          <Gauge className="h-4 w-4" aria-hidden="true" />
          Calibration
        </TabsTrigger>
      </TabsList>
      <TabsContent value="work-orders">
        <WorkOrdersTab canManage={canManage} />
      </TabsContent>
      <TabsContent value="calibration">
        <CalibrationTab canManage={canManage} />
      </TabsContent>
    </Tabs>
  );
}

export default function MaintenancePage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader
          title="Maintenance"
          description="Work orders for repairs, preventive jobs and calibration compliance."
        />
        <MaintenanceContent />
      </div>
    </QueryClientProvider>
  );
}
