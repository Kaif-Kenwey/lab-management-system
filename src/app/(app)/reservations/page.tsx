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
import { CalendarPlus, Loader2, Timer } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { RESERVATION_STATUS } from "@/lib/constants";
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

type Me = { session: { userId: string; role: string; name: string } };

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Request failed");
  }
  return res.json();
}

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
      <ReservationsContent />
    </QueryClientProvider>
  );
}

function ReservationsContent() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => fetcher("/api/auth/me") });
  const equipmentOptions = useQuery<EquipmentOption[]>({
    queryKey: ["equipment-options"],
    queryFn: () => fetcher("/api/equipment"),
  });

  const reservations = useQuery<ReservationRow[]>({
    queryKey: ["reservations", status],
    queryFn: () => fetcher(`/api/reservations${status !== "ALL" ? `?status=${status}` : ""}`),
  });

  const role = me.data?.session?.role;
  const myId = me.data?.session?.userId;
  const canApprove = role === "ADMIN" || role === "LAB_MANAGER";

  useEffect(() => {
    if (reservations.isError) {
      toast({
        title: "Failed to load reservations",
        description:
          reservations.error instanceof Error ? reservations.error.message : "Something went wrong",
        variant: "destructive",
      });
    }
  }, [reservations.isError, reservations.error]);

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Request failed");
      }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast({ title: `Reservation ${vars.status.toLowerCase()}` });
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const createReservation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: form.equipmentId,
          startAt: form.startAt ? new Date(form.startAt).toISOString() : "",
          endAt: form.endAt ? new Date(form.endAt).toISOString() : "",
          purpose: form.purpose.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast({ title: "Reservation requested" });
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) =>
      toast({ title: "Could not create reservation", description: e.message, variant: "destructive" }),
  });

  function isOwner(row: ReservationRow) {
    return !!myId && (row.userId === myId || row.user?.id === myId);
  }

  const rows = reservations.data ?? [];
  const canSubmit =
    form.equipmentId !== "" && form.startAt !== "" && form.endAt !== "" && !createReservation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        description="Equipment bookings and approval queue"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <CalendarPlus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            New Reservation
          </Button>
        }
      />

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="ALL">All</TabsTrigger>
          {RESERVATION_STATUS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s.replace(/_/g, " ")}
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
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Timer}
                title="No reservations"
                description={
                  status !== "ALL"
                    ? "No reservations with this status yet."
                    : "Book equipment by creating a reservation request."
                }
                action={
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
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
                  {rows.map((row) => (
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
                          {canApprove && row.status === "PENDING" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
                                disabled={patchStatus.isPending}
                                onClick={() => patchStatus.mutate({ id: row.id, status: "APPROVED" })}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                                disabled={patchStatus.isPending}
                                onClick={() => patchStatus.mutate({ id: row.id, status: "REJECTED" })}
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {isOwner(row) && (row.status === "PENDING" || row.status === "APPROVED") ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              disabled={patchStatus.isPending}
                              onClick={() => patchStatus.mutate({ id: row.id, status: "CANCELLED" })}
                            >
                              Cancel
                            </Button>
                          ) : null}
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
