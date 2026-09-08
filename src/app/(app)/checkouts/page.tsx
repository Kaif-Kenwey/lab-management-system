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
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  PackageOpen,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
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
  notes?: string | null;
  equipment?: { name?: string; code?: string } | null;
  user?: { name?: string } | null;
};

type EquipmentOption = { id: string; name: string; code: string; status: string };
type UserOption = { id: string; name: string; email: string; status: string };

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
      <CheckoutsContent />
    </QueryClientProvider>
  );
}

function CheckoutsContent() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [checkinRow, setCheckinRow] = useState<CheckoutRow | null>(null);
  const [conditionIn, setConditionIn] = useState("");

  const checkouts = useQuery<CheckoutRow[]>({
    queryKey: ["checkouts"],
    queryFn: () => fetcher("/api/checkouts"),
  });

  const availableEquipment = useQuery<EquipmentOption[]>({
    queryKey: ["equipment", { status: "AVAILABLE" }],
    queryFn: () => fetcher("/api/equipment?status=AVAILABLE"),
    enabled: createOpen,
  });

  const users = useQuery<UserOption[]>({
    queryKey: ["users"],
    queryFn: () => fetcher("/api/users"),
    enabled: createOpen,
  });

  useEffect(() => {
    if (checkouts.isError) {
      toast({
        title: "Failed to load checkouts",
        description: checkouts.error instanceof Error ? checkouts.error.message : "Something went wrong",
        variant: "destructive",
      });
    }
  }, [checkouts.isError, checkouts.error]);

  const rows = checkouts.data ?? [];
  const overdueCount = rows.filter((r) => isOverdue(r) || r.status === "OVERDUE").length;
  const activeCount = rows.filter((r) => r.status === "ACTIVE" && !isOverdue(r)).length;
  const returnedCount = rows.filter((r) => r.status === "RETURNED").length;

  const createCheckout = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: form.equipmentId,
          userId: form.userId,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : "",
          conditionOut: form.conditionOut,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Request failed");
      }
      return res.json();
    },
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
      const res = await fetch(`/api/checkouts/${checkinRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkedIn: true, conditionIn }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast({ title: "Equipment checked in" });
      setCheckinRow(null);
      setConditionIn("");
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
        <StatCard title="Overdue" value={overdueCount} icon={TriangleAlert} hint="Past due date" />
        <StatCard title="Returned" value={returnedCount} icon={CheckCircle2} hint="Checked in" />
      </div>

      <Card>
        <CardContent className="p-0">
          {checkouts.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ArrowLeftRight}
                title="No checkouts"
                description="When equipment is issued to a user it will appear here."
                action={
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <ArrowLeftRight className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    New Checkout
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
                            {row.status === "ACTIVE" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={checkin.isPending}
                                onClick={() => {
                                  setConditionIn("");
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
