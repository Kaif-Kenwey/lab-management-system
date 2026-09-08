"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient as useRQClient } from "@tanstack/react-query";
import { ShieldAlert, Plus, Loader2, TriangleAlert, Siren } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useToast } from "@/hooks/use-toast";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Request failed");
  }
  return res.json();
}

type Incident = {
  id: string;
  title: string;
  description?: string | null;
  severity: string;
  status: string;
  occurredAt: string;
  lab?: { name: string; code: string } | null;
  reportedBy?: { name: string } | null;
};

type Lab = { id: string; name: string; code: string };

const INCIDENT_SEVERITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const INCIDENT_STATUS = ["OPEN", "INVESTIGATING", "RESOLVED"];
const CAN_MANAGE = ["ADMIN", "LAB_MANAGER", "TECHNICIAN"];

function IncidentsContent() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", labId: "none", severity: "LOW", description: "" });

  const { data: me } = useQuery<{ session: { role: string } }>({ queryKey: ["me"], queryFn: () => fetcher("/api/auth/me") });
  const role = me?.session?.role;
  const canManage = role ? CAN_MANAGE.includes(role) : false;

  const { data: labs } = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => fetcher("/api/labs") });

  const params = new URLSearchParams();
  if (severity !== "all") params.set("severity", severity);
  if (status !== "all") params.set("status", status);
  const qs = params.toString();

  const { data: incidents, isLoading, isError, error, refetch, isRefetching } = useQuery<Incident[]>({
    queryKey: ["incidents", severity, status],
    queryFn: () => fetcher(`/api/incidents${qs ? `?${qs}` : ""}`),
  });

  const list = incidents ?? [];

  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Update failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Incident status updated" });
      rq.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Create failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Incident reported" });
      setOpen(false);
      setForm({ title: "", labId: "none", severity: "LOW", description: "" });
      rq.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: Error) => toast({ title: "Report failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Incident log</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {INCIDENT_SEVERITY.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INCIDENT_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus className="h-4 w-4" />
                  Report Incident
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Report incident</DialogTitle>
                  <DialogDescription>Log a safety incident or hazard observed in a lab.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label htmlFor="inc-title">Title</Label>
                    <Input id="inc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Spilled solvent on bench 3" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Lab</Label>
                      <Select value={form.labId} onValueChange={(v) => setForm({ ...form, labId: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select lab" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem disabled value="none">Select lab</SelectItem>
                          {(labs ?? []).map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Severity</Label>
                      <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INCIDENT_SEVERITY.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="inc-desc">Description</Label>
                    <Textarea id="inc-desc" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What happened, who was involved, immediate actions taken..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() =>
                      create.mutate({
                        title: form.title,
                        labId: form.labId === "none" ? undefined : form.labId,
                        severity: form.severity,
                        description: form.description || undefined,
                      })
                    }
                    disabled={create.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Report
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load incidents"
                description={error instanceof Error ? error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Siren} title="No incidents found" description="Reported incidents will appear here. Stay safe." />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Lab</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reported by</TableHead>
                    <TableHead>Occurred at</TableHead>
                    {canManage ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((inc) => (
                    <TableRow key={inc.id}>
                      <TableCell className="font-medium max-w-56">
                        <span className="block truncate" title={inc.title}>{inc.title}</span>
                      </TableCell>
                      <TableCell>{inc.lab?.name ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={inc.severity} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inc.status} />
                      </TableCell>
                      <TableCell>{inc.reportedBy?.name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(inc.occurredAt), "dd MMM yyyy, HH:mm")}</TableCell>
                      {canManage ? (
                        <TableCell>
                          <div className="flex justify-end">
                            <Select
                              value={inc.status}
                              onValueChange={(v) => {
                                if (v !== inc.status) changeStatus.mutate({ id: inc.id, next: v });
                              }}
                            >
                              <SelectTrigger className="h-8 w-36 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INCIDENT_STATUS.map((s) => (
                                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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

      {!canManage && role ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />
          Status changes are restricted to admins, lab managers and technicians.
        </p>
      ) : null}
    </div>
  );
}

export default function IncidentsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Incidents" description="Report and track lab safety incidents through resolution." />
        <IncidentsContent />
      </div>
    </QueryClientProvider>
  );
}
