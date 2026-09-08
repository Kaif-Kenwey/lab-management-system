"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient as useRQClient } from "@tanstack/react-query";
import { Wrench, Plus, Loader2, CalendarClock, CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
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
import { StatCard } from "@/components/shared/stat-card";
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

type MaintenanceRecord = {
  id: string;
  type: string;
  status: string;
  scheduledAt: string;
  completedAt?: string | null;
  cost?: number | null;
  notes?: string | null;
  equipment?: { name: string; code: string } | null;
  technician?: { name: string } | null;
};

type Equipment = { id: string; name: string; code: string };
type UserRow = { id: string; name: string; role: string };

const MAINTENANCE_TYPE = ["PREVENTIVE", "CORRECTIVE", "CALIBRATION"];
const MAINTENANCE_STATUS = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

function MaintenanceContent() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    equipmentId: "none",
    type: "PREVENTIVE",
    technicianId: "none",
    scheduledAt: "",
    cost: "0",
    notes: "",
  });

  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  const qs = params.toString();

  const { data: records, isLoading, isError, error, refetch, isRefetching } = useQuery<MaintenanceRecord[]>({
    queryKey: ["maintenance", status],
    queryFn: () => fetcher(`/api/maintenance${qs ? `?${qs}` : ""}`),
  });

  const { data: equipment } = useQuery<Equipment[]>({ queryKey: ["equipment"], queryFn: () => fetcher("/api/equipment") });
  const { data: users } = useQuery<UserRow[]>({ queryKey: ["users"], queryFn: () => fetcher("/api/users") });
  const technicians = (users ?? []).filter((u) => u.role === "TECHNICIAN" || u.role === "ADMIN" || u.role === "LAB_MANAGER");

  const all = records ?? [];
  const scheduledCount = all.filter((r) => r.status === "SCHEDULED").length;
  const inProgressCount = all.filter((r) => r.status === "IN_PROGRESS").length;
  const completedCount = all.filter((r) => r.status === "COMPLETED").length;

  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      fetch(`/api/maintenance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Update failed");
        return d;
      }),
    onSuccess: (_d, vars) => {
      toast({ title: vars.next === "COMPLETED" ? "Maintenance completed" : "Maintenance started" });
      rq.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Create failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Maintenance scheduled" });
      setOpen(false);
      setForm({ equipmentId: "none", type: "PREVENTIVE", technicianId: "none", scheduledAt: "", cost: "0", notes: "" });
      rq.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: Error) => toast({ title: "Schedule failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Scheduled" value={scheduledCount} icon={CalendarClock} />
        <StatCard title="In progress" value={inProgressCount} icon={Wrench} />
        <StatCard title="Completed" value={completedCount} icon={CircleCheck} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Maintenance records</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {MAINTENANCE_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus className="h-4 w-4" />
                  Schedule Maintenance
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Schedule maintenance</DialogTitle>
                  <DialogDescription>Plan preventive, corrective or calibration work for an equipment item.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label>Equipment</Label>
                    <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select equipment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem disabled value="none">Select equipment</SelectItem>
                        {(equipment ?? []).map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name} ({e.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Type</Label>
                      <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MAINTENANCE_TYPE.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Technician</Label>
                      <Select value={form.technicianId} onValueChange={(v) => setForm({ ...form, technicianId: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {technicians.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="mnt-when">Scheduled at</Label>
                      <Input id="mnt-when" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="mnt-cost">Cost (₹)</Label>
                      <Input id="mnt-cost" type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="mnt-notes">Notes</Label>
                    <Textarea id="mnt-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Describe the work to be performed" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() =>
                      create.mutate({
                        equipmentId: form.equipmentId === "none" ? undefined : form.equipmentId,
                        type: form.type,
                        technicianId: form.technicianId === "none" ? undefined : form.technicianId,
                        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
                        cost: Number(form.cost) || 0,
                        notes: form.notes || undefined,
                      })
                    }
                    disabled={create.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Schedule
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
                title="Could not load maintenance records"
                description={error instanceof Error ? error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : all.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Wrench} title="No maintenance records" description="Schedule maintenance to keep equipment in good condition." />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Technician</TableHead>
                    <TableHead>Scheduled at</TableHead>
                    <TableHead>Completed at</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {all.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.equipment?.name ?? "—"}
                        {r.equipment?.code ? <span className="block font-mono text-xs text-muted-foreground">{r.equipment.code}</span> : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.type}</TableCell>
                      <TableCell>{r.technician?.name ?? "Unassigned"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.scheduledAt ? format(new Date(r.scheduledAt), "dd MMM yyyy, HH:mm") : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {r.completedAt ? format(new Date(r.completedAt), "dd MMM yyyy, HH:mm") : "—"}
                      </TableCell>
                      <TableCell>₹{Number(r.cost ?? 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {r.status === "SCHEDULED" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                              disabled={changeStatus.isPending}
                              onClick={() => changeStatus.mutate({ id: r.id, next: "IN_PROGRESS" })}
                            >
                              <CircleDashed className="h-3.5 w-3.5" />
                              Start
                            </Button>
                          ) : r.status === "IN_PROGRESS" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                              disabled={changeStatus.isPending}
                              onClick={() => changeStatus.mutate({ id: r.id, next: "COMPLETED" })}
                            >
                              <CircleCheck className="h-3.5 w-3.5" />
                              Complete
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MaintenancePage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Maintenance" description="Schedule and track preventive, corrective and calibration work." />
        <MaintenanceContent />
      </div>
    </QueryClientProvider>
  );
}
