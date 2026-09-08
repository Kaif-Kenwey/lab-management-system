"use client";

import { useEffect, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CircleCheck,
  Eye,
  Loader2,
  Plus,
  SearchX,
  ShieldAlert,
  Siren,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiFetch, apiJson } from "@/lib/client";
import { INCIDENT_SEVERITY, INCIDENT_STATUS, INCIDENT_TYPE } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

type Me = { session: { userId: string; role: string; name: string }; permissions: string[] };
type Incident = {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  severity: string;
  status: string;
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
  responsiblePerson?: string | null;
  closureNotes?: string | null;
  occurredAt: string;
  createdAt: string;
  containedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  lab?: { id: string; name: string; code: string } | null;
  reportedBy?: { id: string; name: string } | null;
};
type Lab = { id: string; name: string; code: string };

function humanize(s: string) {
  return s.replace(/_/g, " ");
}
function fmt(v?: string | null) {
  if (!v) return "—";
  try {
    return format(new Date(v), "PPp");
  } catch {
    return "—";
  }
}

const LIFECYCLE_STEPS = ["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED"];

function IncidentContent() {
  const rq = useQueryClient();
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    labId: "none",
    type: "OTHER",
    severity: "MEDIUM",
    description: "",
    occurredAt: "",
  });
  const [detail, setDetail] = useState<Incident | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Incident | null>(null);
  const [resolveRootCause, setResolveRootCause] = useState("");
  const [closeTarget, setCloseTarget] = useState<Incident | null>(null);
  const [closureNotes, setClosureNotes] = useState("");

  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });
  const canManage = (me.data?.permissions ?? []).includes("incidents.manage");
  const canReport = (me.data?.permissions ?? []).includes("incidents.report");

  const labs = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => apiFetch<Lab[]>("/api/labs") });

  const params = new URLSearchParams();
  if (severity !== "all") params.set("severity", severity);
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);
  const qs = params.toString();

  const incidents = useQuery<Incident[]>({
    queryKey: ["incidents", severity, status, type],
    queryFn: () => apiFetch<Incident[]>(`/api/incidents${qs ? `?${qs}` : ""}`),
  });

  // Keep the detail sheet in sync with fresh list data
  useEffect(() => {
    if (!detail) return;
    const fresh = (incidents.data ?? []).find((i) => i.id === detail.id);
    if (fresh && fresh !== detail) setDetail(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents.data]);

  useEffect(() => {
    if (createOpen) {
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
      setCreateForm((f) => ({ ...f, occurredAt: local.toISOString().slice(0, 16) }));
    }
  }, [createOpen]);

  const create = useMutation({
    mutationFn: () =>
      apiJson<Incident>("/api/incidents", "POST", {
        title: createForm.title.trim(),
        labId: createForm.labId === "none" ? undefined : createForm.labId,
        type: createForm.type,
        severity: createForm.severity,
        description: createForm.description.trim() || undefined,
        occurredAt: createForm.occurredAt ? new Date(createForm.occurredAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      toast({ title: "Incident reported" });
      setCreateOpen(false);
      setCreateForm({ title: "", labId: "none", type: "OTHER", severity: "MEDIUM", description: "", occurredAt: "" });
      rq.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: Error) =>
      toast({ title: "Report failed", description: e.message, variant: "destructive" }),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiJson<Incident>(`/api/incidents/${id}`, "PATCH", body),
    onSuccess: (updated, vars) => {
      const next = vars.body.status as string | undefined;
      toast({ title: next ? `Incident ${next.toLowerCase()}` : "Incident updated" });
      rq.invalidateQueries({ queryKey: ["incidents"] });
      if (next === "RESOLVED") setResolveTarget(null);
      if (next === "CLOSED") setCloseTarget(null);
      void updated;
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  function lifecycleAction(i: Incident) {
    if (!canManage) return null;
    switch (i.status) {
      case "OPEN":
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ id: i.id, body: { status: "INVESTIGATING" } })}
          >
            <SearchX className="h-3.5 w-3.5" aria-hidden="true" />
            Investigate
          </Button>
        );
      case "INVESTIGATING":
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ id: i.id, body: { status: "CONTAINED" } })}
          >
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Contain
          </Button>
        );
      case "CONTAINED":
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
            disabled={patch.isPending}
            onClick={() => {
              setResolveRootCause(i.rootCause ?? "");
              setResolveTarget(i);
            }}
          >
            <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Resolve
          </Button>
        );
      case "RESOLVED":
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={patch.isPending}
            onClick={() => {
              setClosureNotes(i.closureNotes ?? "");
              setCloseTarget(i);
            }}
          >
            Close
          </Button>
        );
      default:
        return <span className="text-xs text-muted-foreground">—</span>;
    }
  }

  const list = incidents.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incidents"
        description="Report, investigate and resolve lab safety incidents through a full lifecycle."
        actions={
          canReport ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Report Incident
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Incident log</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="sm:w-44" aria-label="Filter by type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {INCIDENT_TYPE.map((t) => (
                  <SelectItem key={t} value={t}>
                    {humanize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="sm:w-40" aria-label="Filter by severity">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {INCIDENT_SEVERITY.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-44" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INCIDENT_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {incidents.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : incidents.isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load incidents"
                description={incidents.error instanceof Error ? incidents.error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => incidents.refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Siren}
                title="No incidents found"
                description="Reported incidents will appear here. Stay safe."
              />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Lab</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Reported by</TableHead>
                    <TableHead>Occurred at</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((inc) => (
                    <TableRow key={inc.id}>
                      <TableCell className="font-medium max-w-56">
                        <button
                          type="button"
                          className="block truncate text-left hover:underline"
                          title={inc.title}
                          onClick={() => setDetail(inc)}
                        >
                          {inc.title}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 whitespace-nowrap">
                          {humanize(inc.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{inc.lab?.name ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={inc.severity} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{inc.reportedBy?.name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmt(inc.occurredAt)}</TableCell>
                      <TableCell>
                        <StatusBadge status={inc.status} />
                      </TableCell>
                      {canManage ? <TableCell>{lifecycleAction(inc)}</TableCell> : null}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`View details of ${inc.title}`}
                          onClick={() => setDetail(inc)}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report incident dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report incident</DialogTitle>
            <DialogDescription>Log a safety incident or hazard observed in a lab.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="inc-title">Title</Label>
              <Input
                id="inc-title"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                placeholder="Spilled solvent on bench 3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Lab</Label>
                <Select value={createForm.labId} onValueChange={(v) => setCreateForm({ ...createForm, labId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select lab" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem disabled value="none">
                      Select lab
                    </SelectItem>
                    {(labs.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={createForm.type} onValueChange={(v) => setCreateForm({ ...createForm, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_TYPE.map((t) => (
                      <SelectItem key={t} value={t}>
                        {humanize(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Severity</Label>
                <Select value={createForm.severity} onValueChange={(v) => setCreateForm({ ...createForm, severity: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_SEVERITY.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inc-when">Occurred at</Label>
                <Input
                  id="inc-when"
                  type="datetime-local"
                  value={createForm.occurredAt}
                  onChange={(e) => setCreateForm({ ...createForm, occurredAt: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inc-desc">Description</Label>
              <Textarea
                id="inc-desc"
                rows={4}
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="What happened, who was involved, immediate actions taken..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !createForm.title.trim() || createForm.labId === "none"}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog — rootCause required */}
      <Dialog open={!!resolveTarget} onOpenChange={(o) => !o && setResolveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve incident</DialogTitle>
            <DialogDescription>
              {resolveTarget?.title} — a root cause is required before resolution.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="resolve-root">Root cause</Label>
            <Textarea
              id="resolve-root"
              rows={4}
              value={resolveRootCause}
              onChange={(e) => setResolveRootCause(e.target.value)}
              placeholder="What actually caused this incident?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTarget(null)} disabled={patch.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                resolveTarget &&
                patch.mutate({
                  id: resolveTarget.id,
                  body: { status: "RESOLVED", rootCause: resolveRootCause.trim() },
                })
              }
              disabled={patch.isPending || !resolveRootCause.trim()}
            >
              {patch.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close dialog — closure notes */}
      <Dialog open={!!closeTarget} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close incident</DialogTitle>
            <DialogDescription>{closeTarget?.title} — closing an incident is final.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="close-notes">Closure notes</Label>
            <Textarea
              id="close-notes"
              rows={3}
              value={closureNotes}
              onChange={(e) => setClosureNotes(e.target.value)}
              placeholder="Follow-ups, lessons learned, sign-off..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)} disabled={patch.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                closeTarget &&
                patch.mutate({
                  id: closeTarget.id,
                  body: { status: "CLOSED", closureNotes: closureNotes.trim() || undefined },
                })
              }
              disabled={patch.isPending}
            >
              {patch.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Close incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <DetailSheet
        incident={detail}
        onClose={() => setDetail(null)}
        canManage={canManage}
        patch={patch}
        onResolve={(i) => {
          setResolveRootCause(i.rootCause ?? "");
          setResolveTarget(i);
        }}
        onClose2={(i) => {
          setClosureNotes(i.closureNotes ?? "");
          setCloseTarget(i);
        }}
      />
    </div>
  );
}

function DetailSheet({
  incident,
  onClose,
  canManage,
  patch,
  onResolve,
  onClose2,
}: {
  incident: Incident | null;
  onClose: () => void;
  canManage: boolean;
  patch: {
    isPending: boolean;
    mutate: (v: { id: string; body: Record<string, unknown> }) => void;
  };
  onResolve: (i: Incident) => void;
  onClose2: (i: Incident) => void;
}) {
  const [form, setForm] = useState({
    rootCause: "",
    correctiveAction: "",
    preventiveAction: "",
    responsiblePerson: "",
  });

  useEffect(() => {
    if (incident) {
      queueMicrotask(() =>
        setForm({
          rootCause: incident.rootCause ?? "",
          correctiveAction: incident.correctiveAction ?? "",
          preventiveAction: incident.preventiveAction ?? "",
          responsiblePerson: incident.responsiblePerson ?? "",
        })
      );
    }
  }, [incident]);

  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: () =>
      apiJson<Incident>(`/api/incidents/${incident?.id}`, "PATCH", {
        rootCause: form.rootCause.trim() || null,
        correctiveAction: form.correctiveAction.trim() || null,
        preventiveAction: form.preventiveAction.trim() || null,
        responsiblePerson: form.responsiblePerson.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Investigation notes saved" });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (!incident) return null;

  const stepIndex = LIFECYCLE_STEPS.indexOf(incident.status);

  return (
    <Sheet open={!!incident} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{incident.title}</SheetTitle>
          <SheetDescription>
            {incident.lab?.name ?? "No lab"} · {humanize(incident.type)} · reported by{" "}
            {incident.reportedBy?.name ?? "unknown"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          {/* Lifecycle stepper */}
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {LIFECYCLE_STEPS.map((s, idx) => (
                <Badge
                  key={s}
                  variant="outline"
                  className={
                    idx <= stepIndex
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "text-muted-foreground"
                  }
                >
                  {humanize(s)}
                </Badge>
              ))}
            </div>
            {canManage ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {incident.status === "OPEN" ? (
                  <Button
                    size="sm"
                    disabled={patch.isPending || save.isPending}
                    onClick={() => patch.mutate({ id: incident.id, body: { status: "INVESTIGATING" } })}
                  >
                    Start investigation
                  </Button>
                ) : null}
                {incident.status === "INVESTIGATING" ? (
                  <Button
                    size="sm"
                    disabled={patch.isPending || save.isPending}
                    onClick={() => patch.mutate({ id: incident.id, body: { status: "CONTAINED" } })}
                  >
                    Contain
                  </Button>
                ) : null}
                {incident.status === "CONTAINED" ? (
                  <Button size="sm" disabled={patch.isPending || save.isPending} onClick={() => onResolve(incident)}>
                    Resolve
                  </Button>
                ) : null}
                {incident.status === "RESOLVED" ? (
                  <Button size="sm" disabled={patch.isPending || save.isPending} onClick={() => onClose2(incident)}>
                    Close
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Description</h4>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {incident.description?.trim() || "No description provided."}
            </p>
          </div>

          {/* Timestamps */}
          <div className="rounded-lg border p-3 text-sm">
            <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Occurred</dt>
                <dd>{fmt(incident.occurredAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Reported</dt>
                <dd>{fmt(incident.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Contained</dt>
                <dd>{fmt(incident.containedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Resolved</dt>
                <dd>{fmt(incident.resolvedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Closed</dt>
                <dd>{fmt(incident.closedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Severity</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={incident.severity} />
                </dd>
              </div>
            </dl>
          </div>

          {/* Editable investigation fields */}
          {canManage ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Investigation</h4>
              <div className="grid gap-2">
                <Label htmlFor="det-root">Root cause</Label>
                <Textarea
                  id="det-root"
                  rows={3}
                  value={form.rootCause}
                  onChange={(e) => setForm({ ...form, rootCause: e.target.value })}
                  placeholder="What actually caused this incident?"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="det-corrective">Corrective action</Label>
                <Textarea
                  id="det-corrective"
                  rows={2}
                  value={form.correctiveAction}
                  onChange={(e) => setForm({ ...form, correctiveAction: e.target.value })}
                  placeholder="What was done to fix it?"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="det-preventive">Preventive action</Label>
                <Textarea
                  id="det-preventive"
                  rows={2}
                  value={form.preventiveAction}
                  onChange={(e) => setForm({ ...form, preventiveAction: e.target.value })}
                  placeholder="What will prevent recurrence?"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="det-responsible">Responsible person</Label>
                <Input
                  id="det-responsible"
                  value={form.responsiblePerson}
                  onChange={(e) => setForm({ ...form, responsiblePerson: e.target.value })}
                  placeholder="Who owns the follow-up?"
                />
              </div>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
                Save notes
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Investigation</h4>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Root cause: </span>
                {incident.rootCause?.trim() || "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Corrective action: </span>
                {incident.correctiveAction?.trim() || "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Preventive action: </span>
                {incident.preventiveAction?.trim() || "—"}
              </p>
              {incident.closureNotes ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Closure notes: </span>
                  {incident.closureNotes}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function IncidentsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <IncidentContent />
    </QueryClientProvider>
  );
}
