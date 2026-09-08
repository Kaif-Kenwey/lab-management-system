"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  PackageOpen,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { can } from "@/lib/permissions";
import { apiFetch, apiJson } from "@/lib/client";
import { EQUIPMENT_CONDITION } from "@/lib/constants";
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
import { StatCard } from "@/components/shared/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

type CheckoutRow = {
  id: string;
  equipmentId: string;
  userId: string;
  checkedOutAt: string;
  dueAt: string;
  checkedInAt?: string | null;
  status: string;
  conditionOut?: string | null;
  conditionIn?: string | null;
  accessoriesIn?: string | null;
  notes?: string | null;
  equipment?: { name?: string; code?: string } | null;
  user?: { name?: string } | null;
};

type EquipmentOption = { id: string; name: string; code: string; status: string };
type UserOption = { id: string; name: string; email: string; status: string };

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

function humanize(s: string) {
  return s.replace(/_/g, " ");
}

function isOverdue(row: CheckoutRow) {
  if (row.status !== "ACTIVE" || !row.dueAt) return false;
  try {
    return new Date(row.dueAt).getTime() < Date.now();
  } catch {
    return false;
  }
}

const emptyForm = { equipmentId: "", userId: "", dueAt: "", conditionOut: "", notes: "" };

export default function CheckoutsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-9 w-64" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        <CheckoutsContent />
      </Suspense>
    </QueryClientProvider>
  );
}

function CheckoutsContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const equipmentParam = searchParams.get("equipment") ?? "";
  const statusParam = searchParams.get("status") ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [checkinRow, setCheckinRow] = useState<CheckoutRow | null>(null);
  const [conditionIn, setConditionIn] = useState("");
  const [accessoriesIn, setAccessoriesIn] = useState("");

  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });

  const checkouts = useQuery<CheckoutRow[]>({
    queryKey: ["checkouts"],
    queryFn: () => apiFetch<CheckoutRow[]>("/api/checkouts"),
  });

  const availableEquipment = useQuery<EquipmentOption[]>({
    queryKey: ["equipment", { status: "AVAILABLE" }],
    queryFn: () => apiFetch<EquipmentOption[]>("/api/equipment?status=AVAILABLE"),
    enabled: createOpen,
  });

  const users = useQuery<UserOption[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserOption[]>("/api/users"),
    enabled: createOpen,
  });

  const role = me.data?.session?.role;
  const myId = me.data?.session?.userId;

  // Check-in is for approver/field roles (equipment.manage) or the borrower.
  const canCheckInRow = (row: CheckoutRow) =>
    row.status === "ACTIVE" &&
    (!!myId && (row.userId === myId || can(role ?? "", "equipment.manage")));

  const rows = (checkouts.data ?? []).filter((r) => {
    if (equipmentParam && r.equipmentId !== equipmentParam) return false;
    if (statusParam === "OVERDUE") return isOverdue(r) || r.status === "OVERDUE";
    if (statusParam === "ACTIVE") return r.status === "ACTIVE" && !isOverdue(r);
    return true;
  });

  const allRows = checkouts.data ?? [];
  const overdueCount = allRows.filter((r) => isOverdue(r) || r.status === "OVERDUE").length;
  const activeCount = allRows.filter((r) => r.status === "ACTIVE" && !isOverdue(r)).length;
  const returnedCount = allRows.filter((r) => r.status === "RETURNED").length;

  const createCheckout = useMutation({
    mutationFn: async () =>
      apiJson("/api/checkouts", "POST", {
        equipmentId: form.equipmentId,
        userId: form.userId,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : "",
        conditionOut: form.conditionOut,
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast({ title: "Equipment checked out" });
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) =>
      toast({ title: "Could not create checkout", description: e.message, variant: "destructive" }),
  });

  const checkin = useMutation({
    mutationFn: async () => {
      if (!checkinRow) return null;
      return apiJson(`/api/checkouts/${checkinRow.id}`, "PATCH", {
        checkedIn: true,
        conditionIn,
        accessoriesIn: accessoriesIn.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast({ title: "Equipment checked in" });
      setCheckinRow(null);
      setConditionIn("");
      setAccessoriesIn("");
    },
    onError: (e: Error) =>
      toast({ title: "Check-in failed", description: e.message, variant: "destructive" }),
  });

  const canSubmit =
    form.equipmentId !== "" &&
    form.userId !== "" &&
    form.dueAt !== "" &&
    form.conditionOut !== "" &&
    !createCheckout.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Checkouts"
        description="Equipment issued to users and its return status"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <ArrowLeftRight className="h-4 w-4 mr-1.5" aria-hidden="true" />
            New Checkout
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Active" value={activeCount} icon={PackageOpen} hint="Currently issued" />
        <Link href="/checkouts?status=OVERDUE" className="group block">
          <StatCard
            title="Overdue"
            value={overdueCount}
            icon={TriangleAlert}
            hint={overdueCount > 0 ? "View overdue list" : "None past due"}
            className="transition-colors group-hover:border-red-300 dark:group-hover:border-red-800"
          />
        </Link>
        <StatCard title="Returned" value={returnedCount} icon={CheckCircle2} hint="Checked in" />
      </div>

      {statusParam ? (
        <p className="text-sm text-muted-foreground">
          Filtered to <span className="font-medium text-foreground">{humanize(statusParam)}</span>.{" "}
          <a href="/checkouts" className="underline underline-offset-2 hover:text-foreground">
            Clear filter
          </a>
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {checkouts.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : checkouts.isError ? (
            <div className="p-6">
              <EmptyState
                icon={ArrowLeftRight}
                title="Failed to load checkouts"
                description={
                  checkouts.error instanceof Error ? checkouts.error.message : "Something went wrong"
                }
                action={
                  <Button variant="outline" onClick={() => checkouts.refetch()} disabled={checkouts.isRefetching}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ArrowLeftRight}
                title="No checkouts"
                description={
                  statusParam || equipmentParam
                    ? "No checkouts match the current filter."
                    : "When equipment is issued to a user it will appear here."
                }
                action={
                  !statusParam && !equipmentParam ? (
                    <Button variant="outline" onClick={() => setCreateOpen(true)}>
                      <ArrowLeftRight className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      New Checkout
                    </Button>
                  ) : undefined
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
                    <TableHead>Checked out</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const overdue = isOverdue(row) || row.status === "OVERDUE";
                    const canCheckIn = canCheckInRow(row);
                    return (
                      <TableRow key={row.id} className={overdue ? "bg-red-50/60 dark:bg-red-950/30" : undefined}>
                        <TableCell>
                          <Link
                            href={`/equipment/${row.equipmentId}`}
                            className="font-medium hover:underline"
                          >
                            {row.equipment?.name || "—"}
                          </Link>
                          {row.equipment?.code ? (
                            <div className="text-xs font-mono text-muted-foreground">{row.equipment.code}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.user?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {fmt(row.checkedOutAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span
                            className={
                              overdue
                                ? "font-medium text-red-600 dark:text-red-400"
                                : "text-muted-foreground"
                            }
                          >
                            {fmt(row.dueAt)}
                          </span>
                          {overdue ? <StatusBadge status="OVERDUE" className="ml-2" /> : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={overdue && row.status === "ACTIVE" ? "OVERDUE" : row.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.conditionOut ? humanize(row.conditionOut) : "—"}
                          {row.conditionIn ? (
                            <span className="text-xs text-muted-foreground"> in: {humanize(row.conditionIn)}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end">
                            {canCheckIn ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={checkin.isPending}
                                onClick={() => {
                                  setConditionIn("");
                                  setAccessoriesIn("");
                                  setCheckinRow(row);
                                }}
                              >
                                Check in
                              </Button>
                            ) : null}
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
            <DialogTitle>New Checkout</DialogTitle>
            <DialogDescription>Issue available equipment to a user with a due date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Equipment</Label>
              <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select available equipment" />
                </SelectTrigger>
                <SelectContent>
                  {(availableEquipment.data ?? []).map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.name} ({eq.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Only AVAILABLE equipment is listed.</p>
            </div>
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {(users.data ?? [])
                    .filter((u) => u.status !== "SUSPENDED")
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="co-due">Due at</Label>
                <Input
                  id="co-due"
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Condition out</Label>
                <Select
                  value={form.conditionOut}
                  onValueChange={(v) => setForm({ ...form, conditionOut: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_CONDITION.map((c) => (
                      <SelectItem key={c} value={c}>
                        {humanize(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-notes">Notes</Label>
              <Textarea
                id="co-notes"
                rows={3}
                placeholder="Accessories included, known issues, etc."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createCheckout.isPending}>
              Cancel
            </Button>
            <Button onClick={() => createCheckout.mutate()} disabled={!canSubmit}>
              {createCheckout.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : null}
              Check out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!checkinRow}
        onOpenChange={(o) => {
          if (!o) {
            setCheckinRow(null);
            setConditionIn("");
            setAccessoriesIn("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Check in equipment</DialogTitle>
            <DialogDescription>
              {checkinRow?.equipment?.name ? `${checkinRow.equipment.name} — returned condition.` : "Returned condition."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Condition in</Label>
              <Select value={conditionIn} onValueChange={setConditionIn}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_CONDITION.map((c) => (
                    <SelectItem key={c} value={c}>
                      {humanize(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-accessories">Accessories returned</Label>
              <Input
                id="ci-accessories"
                placeholder="Power cable, probes, carry case..."
                value={accessoriesIn}
                onChange={(e) => setAccessoriesIn(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                List the accessories returned with the equipment, if any.
              </p>
            </div>
            {checkinRow?.notes ? (
              <p className="text-xs text-muted-foreground">Notes: {checkinRow.notes}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCheckinRow(null);
                setConditionIn("");
                setAccessoriesIn("");
              }}
              disabled={checkin.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => checkin.mutate()} disabled={conditionIn === "" || checkin.isPending}>
              {checkin.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : null}
              Confirm check in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
