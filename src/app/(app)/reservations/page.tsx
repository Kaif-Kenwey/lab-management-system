"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarPlus, Loader2, Timer } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiFetch, apiJson } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

const STATUS_TABS = [
  "ALL",
  "PENDING",
  "APPROVED",
  "ACTIVE",
  "COMPLETED",
  "NO_SHOW",
  "REJECTED",
  "CANCELLED",
] as const;

type ReservationRow = {
  id: string;
  equipmentId: string;
  userId?: string;
  startAt: string;
  endAt: string;
  status: string;
  purpose?: string | null;
  equipment?: { name?: string; code?: string } | null;
  user?: { id?: string; name?: string } | null;
};

type EquipmentOption = { id: string; name: string; code: string; status: string };

type Me = {
  session: { userId: string; role: string; name: string };
  permissions?: string[];
};

function fmt(v?: string | null) {
  if (!v) return "—";
  try {
    return format(new Date(v), "PPP p");
  } catch {
    return "—";
  }
}

const emptyForm = { equipmentId: "", startAt: "", endAt: "", purpose: "" };

export default function ReservationsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-full max-w-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        <ReservationsContent />
      </Suspense>
    </QueryClientProvider>
  );
}

function ReservationsContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const equipmentParam = searchParams.get("equipment") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const openParam = searchParams.get("open") === "1";

  const initialStatus = STATUS_TABS.includes(statusParam as (typeof STATUS_TABS)[number])
    ? statusParam
    : "ALL";

  const [status, setStatus] = useState(initialStatus);
  const [createOpen, setCreateOpen] = useState(openParam);
  const [form, setForm] = useState(emptyForm);

  // Deep links: /reservations?equipment={id}&open=1 preselects equipment in the
  // create dialog and filters the table down to that equipment.
  useEffect(() => {
    if (equipmentParam) {
      setForm((f) => ({ ...f, equipmentId: equipmentParam }));
    }
  }, [equipmentParam]);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });
  const equipmentOptions = useQuery<EquipmentOption[]>({
    queryKey: ["equipment-options"],
    queryFn: () => apiFetch<EquipmentOption[]>("/api/equipment"),
  });

  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (equipmentParam) params.set("equipmentId", equipmentParam);
  const qs = params.toString();

  const reservations = useQuery<ReservationRow[]>({
    queryKey: ["reservations", { status, equipmentId: equipmentParam }],
    queryFn: () => apiFetch<ReservationRow[]>(`/api/reservations${qs ? `?${qs}` : ""}`),
  });

  const role = me.data?.session?.role;
  const myId = me.data?.session?.userId;
  const permissions = me.data?.permissions ?? [];
  const canApprove =
    permissions.includes("reservations.approve") || role === "ADMIN" || role === "LAB_MANAGER";

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      apiJson(`/api/reservations/${id}`, "PATCH", { status }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["attention"] });
      toast({ title: `Reservation ${vars.status.toLowerCase().replace(/_/g, " ")}` });
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const createReservation = useMutation({
    mutationFn: async () =>
      apiJson("/api/reservations", "POST", {
        equipmentId: form.equipmentId,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : "",
        endAt: form.endAt ? new Date(form.endAt).toISOString() : "",
        purpose: form.purpose.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["attention"] });
      toast({ title: "Reservation requested" });
      setCreateOpen(false);
      setForm({ ...emptyForm, equipmentId: equipmentParam });
    },
    onError: (e: Error) =>
      toast({ title: "Could not create reservation", description: e.message, variant: "destructive" }),
  });

  function isOwner(row: ReservationRow) {
    return !!myId && (row.userId === myId || row.user?.id === myId);
  }

  function actionsFor(row: ReservationRow) {
    const buttons: React.ReactNode[] = [];
    const busy = patchStatus.isPending;

    if (row.status === "PENDING") {
      if (canApprove) {
        buttons.push(
          <Button
            key="approve"
            size="sm"
            variant="outline"
            className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
            disabled={busy}
            onClick={() => patchStatus.mutate({ id: row.id, status: "APPROVED" })}
          >
            Approve
          </Button>,
          <Button
            key="reject"
            size="sm"
            variant="outline"
            className="h-8 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            disabled={busy}
            onClick={() => patchStatus.mutate({ id: row.id, status: "REJECTED" })}
          >
            Reject
          </Button>
        );
      }
      if (isOwner(row)) {
        buttons.push(
          <Button
            key="cancel"
            size="sm"
            variant="ghost"
            className="h-8 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            disabled={busy}
            onClick={() => patchStatus.mutate({ id: row.id, status: "CANCELLED" })}
          >
            Cancel
          </Button>
        );
      }
    }

    if (row.status === "APPROVED") {
      if (canApprove || isOwner(row)) {
        buttons.push(
          <Button
            key="start"
            size="sm"
            variant="outline"
            className="h-8 border-sky-200 text-sky-700 hover:bg-sky-50 dark:border-sky-900 dark:text-sky-400 dark:hover:bg-sky-950"
            disabled={busy}
            onClick={() => patchStatus.mutate({ id: row.id, status: "ACTIVE" })}
          >
            Start
          </Button>
        );
      }
      if (canApprove) {
        buttons.push(
          <Button
            key="noshow"
            size="sm"
            variant="ghost"
            className="h-8 text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
            disabled={busy}
            onClick={() => patchStatus.mutate({ id: row.id, status: "NO_SHOW" })}
          >
            No-show
          </Button>
        );
      }
      if (canApprove || isOwner(row)) {
        buttons.push(
          <Button
            key="cancel"
            size="sm"
            variant="ghost"
            className="h-8 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            disabled={busy}
            onClick={() => patchStatus.mutate({ id: row.id, status: "CANCELLED" })}
          >
            Cancel
          </Button>
        );
      }
    }

    if (row.status === "ACTIVE" && (canApprove || isOwner(row))) {
      buttons.push(
        <Button
          key="complete"
          size="sm"
          variant="outline"
          className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
          disabled={busy}
          onClick={() => patchStatus.mutate({ id: row.id, status: "COMPLETED" })}
        >
          Complete
        </Button>
      );
    }

    return buttons;
  }

  const rows = reservations.data ?? [];
  const selectedEquipment = (equipmentOptions.data ?? []).find((e) => e.id === equipmentParam);
  const canSubmit =
    form.equipmentId !== "" && form.startAt !== "" && form.endAt !== "" && !createReservation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        description="Equipment bookings and approval queue"
        actions={
          <Button
            onClick={() => {
              if (equipmentParam) setForm((f) => ({ ...f, equipmentId: equipmentParam }));
              setCreateOpen(true);
            }}
          >
            <CalendarPlus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            New Reservation
          </Button>
        }
      />

      {equipmentParam ? (
        <p className="text-sm text-muted-foreground">
          Filtered to equipment{" "}
          <span className="font-medium text-foreground">
            {selectedEquipment ? `${selectedEquipment.name} (${selectedEquipment.code})` : equipmentParam}
          </span>
          .{" "}
          <a
            href="/reservations"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Clear filter
          </a>
        </p>
      ) : null}

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="flex flex-wrap h-auto">
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s === "ALL" ? "All" : s.replace(/_/g, " ")}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {reservations.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : reservations.isError ? (
            <div className="p-6">
              <EmptyState
                icon={Timer}
                title="Failed to load reservations"
                description={
                  reservations.error instanceof Error
                    ? reservations.error.message
                    : "Something went wrong"
                }
                action={
                  <Button variant="outline" onClick={() => reservations.refetch()} disabled={reservations.isRefetching}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Timer}
                title="No reservations"
                description={
                  status !== "ALL" || equipmentParam
                    ? "No reservations match the current filters."
                    : "Book equipment by creating a reservation request."
                }
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (equipmentParam) setForm((f) => ({ ...f, equipmentId: equipmentParam }));
                      setCreateOpen(true);
                    }}
                  >
                    <CalendarPlus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    New Reservation
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const actions = actionsFor(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.equipment?.name || "—"}</div>
                          {row.equipment?.code ? (
                            <div className="text-xs font-mono text-muted-foreground">{row.equipment.code}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.user?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {fmt(row.startAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {fmt(row.endAt)}
                        </TableCell>
                        <TableCell className="max-w-52">
                          <span className="text-sm text-muted-foreground line-clamp-2">
                            {row.purpose || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1.5">
                            {actions.length > 0 ? actions : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Reservation</DialogTitle>
            <DialogDescription>
              Request a time slot for equipment. Overlapping bookings will be rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Equipment</Label>
              <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  {(equipmentOptions.data ?? []).map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.name} ({eq.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="res-start">Start</Label>
                <Input
                  id="res-start"
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="res-end">End</Label>
                <Input
                  id="res-end"
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="res-purpose">Purpose</Label>
              <Textarea
                id="res-purpose"
                rows={3}
                placeholder="What will this equipment be used for?"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createReservation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => createReservation.mutate()} disabled={!canSubmit}>
              {createReservation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : null}
              Request reservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
