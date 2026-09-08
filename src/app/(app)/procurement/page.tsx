"use client";

import { Fragment, useMemo, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  PackageCheck,
  Plus,
  Send,
  Banknote,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiFetch, apiJson } from "@/lib/client";
import { VENDOR_CATEGORY } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
type Vendor = {
  id: string;
  name: string;
  contactEmail?: string | null;
  phone?: string | null;
  address?: string | null;
  category?: string | null;
  rating?: number | null;
};
type PurchaseRequest = {
  id: string;
  itemName: string;
  quantity?: number | null;
  estimatedCost?: number | null;
  justification?: string | null;
  status: string;
  vendor?: { name: string } | null;
  requestedBy?: { name: string } | null;
  createdAt: string;
};
type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitCost: number;
  receivedQuantity: number;
  inventoryItem?: { id: string; name: string; sku: string } | null;
};
type ReceiptItem = { id: string; orderItemId: string; quantity: number; condition: string; notes?: string | null };
type Receipt = {
  id: string;
  receivedAt: string;
  invoiceNumber?: string | null;
  notes?: string | null;
  receivedBy?: { id: string; name: string } | null;
  items: ReceiptItem[];
};
type Order = {
  id: string;
  poNumber: string;
  status: string;
  vendor?: { id: string; name: string } | null;
  expectedAt?: string | null;
  orderedAt?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  totalCost: number;
  items: OrderItem[];
  goodsReceipts?: Receipt[];
  _count?: { goodsReceipts: number };
};

function money(n: unknown) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
}
function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return format(new Date(v), "PP");
  } catch {
    return "—";
  }
}

const RECEIPT_CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;

/* ------------------------------ Requests tab ------------------------------ */

const emptyPrForm = { itemName: "", quantity: "1", estimatedCost: "0", vendorId: "none", justification: "" };

function RequestsTab({ perms }: { perms: string[] }) {
  const rq = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyPrForm);

  const canApprove = perms.includes("procurement.approve");
  const canCreate = perms.includes("procurement.create");
  const canReceive = perms.includes("procurement.receive") || canApprove;

  const vendors = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: () => apiFetch<Vendor[]>("/api/vendors") });
  const purchases = useQuery<PurchaseRequest[]>({
    queryKey: ["purchases"],
    queryFn: () => apiFetch<PurchaseRequest[]>("/api/purchases"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiJson(`/api/purchases/${id}`, "PATCH", { status: next }),
    onSuccess: (_d, vars) => {
      toast({ title: `Request ${vars.next.toLowerCase()}` });
      rq.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson("/api/purchases", "POST", {
        itemName: form.itemName.trim(),
        quantity: Number(form.quantity) || 1,
        estimatedCost: Number(form.estimatedCost) || 0,
        vendorId: form.vendorId === "none" ? undefined : form.vendorId,
        justification: form.justification.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Request submitted" });
      setOpen(false);
      setForm(emptyPrForm);
      rq.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (e: Error) =>
      toast({ title: "Submit failed", description: e.message, variant: "destructive" }),
  });

  const list = purchases.data ?? [];
  const pending = list.filter((p) => p.status === "SUBMITTED").length;
  const approvedValue = list
    .filter((p) => ["APPROVED", "ORDERED"].includes(p.status))
    .reduce((sum, p) => sum + Number(p.estimatedCost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total requests" value={list.length} icon={ShoppingCart} />
        <StatCard title="Awaiting approval" value={pending} icon={TriangleAlert} />
        <StatCard title="Approved value" value={money(approvedValue)} icon={Banknote} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Purchase requests</CardTitle>
          {canCreate ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              New Request
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {purchases.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : purchases.isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load purchase requests"
                description={purchases.error instanceof Error ? purchases.error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => purchases.refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ShoppingCart}
                title="No purchase requests"
                description="Submit a request when your lab needs supplies."
              />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Estimated cost</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium max-w-52">
                        <span className="block truncate" title={p.itemName}>
                          {p.itemName}
                        </span>
                      </TableCell>
                      <TableCell>{p.quantity ?? 1}</TableCell>
                      <TableCell>{money(p.estimatedCost)}</TableCell>
                      <TableCell>{p.vendor?.name ?? "—"}</TableCell>
                      <TableCell>{p.requestedBy?.name ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status === "SUBMITTED" && canApprove ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                                disabled={setStatus.isPending}
                                onClick={() => setStatus.mutate({ id: p.id, next: "APPROVED" })}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                                disabled={setStatus.isPending}
                                onClick={() => setStatus.mutate({ id: p.id, next: "REJECTED" })}
                              >
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {p.status === "APPROVED" && canApprove ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              disabled={setStatus.isPending}
                              onClick={() => setStatus.mutate({ id: p.id, next: "ORDERED" })}
                            >
                              Mark Ordered
                            </Button>
                          ) : null}
                          {p.status === "ORDERED" && canReceive ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                              disabled={setStatus.isPending}
                              onClick={() => setStatus.mutate({ id: p.id, next: "RECEIVED" })}
                            >
                              <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              Mark Received
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New purchase request</DialogTitle>
            <DialogDescription>Request an item or restocking for your lab.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pr-item">Item name</Label>
              <Input
                id="pr-item"
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                placeholder="pH buffer set"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pr-qty">Quantity</Label>
                <Input
                  id="pr-qty"
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pr-cost">Estimated cost (₹)</Label>
                <Input
                  id="pr-cost"
                  type="number"
                  min="0"
                  value={form.estimatedCost}
                  onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Vendor</Label>
              <Select value={form.vendorId} onValueChange={(v) => setForm({ ...form, vendorId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vendor yet</SelectItem>
                  {(vendors.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pr-just">Justification</Label>
              <Textarea
                id="pr-just"
                rows={3}
                value={form.justification}
                onChange={(e) => setForm({ ...form, justification: e.target.value })}
                placeholder="Why is this purchase needed?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.itemName.trim()}>
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------- Purchase orders tab -------------------------- */

type PoRow = { name: string; quantity: string; unitCost: string; inventoryItemId: string };

const emptyItemRow: PoRow = { name: "", quantity: "1", unitCost: "0", inventoryItemId: "none" };
const emptyPoForm = { vendorId: "none", expectedAt: "", notes: "" };

function OrdersTab({ perms }: { perms: string[] }) {
  const rq = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [form, setForm] = useState(emptyPoForm);
  const [rows, setRows] = useState<PoRow[]>([{ ...emptyItemRow }]);
  const [receiveOrder, setReceiveOrder] = useState<Order | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<string, string>>({});
  const [receiveConditions, setReceiveConditions] = useState<Record<string, string>>({});
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiptsOrder, setReceiptsOrder] = useState<string | null>(null);

  const canCreate = perms.includes("procurement.create") || perms.includes("procurement.approve");
  const canSend = perms.includes("procurement.approve");
  const canReceive = perms.includes("procurement.receive");

  const orders = useQuery<Order[]>({ queryKey: ["orders"], queryFn: () => apiFetch<Order[]>("/api/orders") });
  const vendors = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: () => apiFetch<Vendor[]>("/api/vendors") });
  const inventoryItems = useQuery<{ id: string; name: string; sku: string }[]>({
    queryKey: ["inventory", "lookup"],
    queryFn: () => apiFetch<{ id: string; name: string; sku: string }[]>("/api/inventory"),
  });

  const list = orders.data ?? [];
  const stats = useMemo(
    () => ({
      draft: list.filter((o) => o.status === "DRAFT").length,
      ordered: list.filter((o) => o.status === "ORDERED").length,
      awaiting: list.filter((o) => o.status === "ORDERED" || o.status === "PARTIALLY_RECEIVED").length,
      received: list.filter((o) => o.status === "RECEIVED").length,
    }),
    [list]
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyPoForm);
    setRows([{ ...emptyItemRow }]);
    setCreateOpen(true);
  }

  function openEdit(order: Order) {
    setEditing(order);
    setForm({
      vendorId: order.vendor?.id ?? "none",
      expectedAt: order.expectedAt ? format(new Date(order.expectedAt), "yyyy-MM-dd") : "",
      notes: order.notes ?? "",
    });
    setRows(
      order.items.map((i) => ({
        name: i.name,
        quantity: String(i.quantity),
        unitCost: String(i.unitCost),
        inventoryItemId: i.inventoryItem?.id ?? "none",
      }))
    );
    setCreateOpen(true);
  }

  function openReceive(order: Order) {
    setReceiveOrder(order);
    const defaults: Record<string, string> = {};
    const conds: Record<string, string> = {};
    for (const i of order.items) {
      const remaining = Math.max(0, i.quantity - i.receivedQuantity);
      defaults[i.id] = String(remaining);
      conds[i.id] = "GOOD";
    }
    setReceiveLines(defaults);
    setReceiveConditions(conds);
    setInvoiceNumber("");
    setReceiveNotes("");
  }

  const saveOrder = useMutation({
    mutationFn: () => {
      const body = {
        vendorId: form.vendorId === "none" ? undefined : form.vendorId,
        expectedAt: form.expectedAt || undefined,
        notes: form.notes.trim() || undefined,
        items: rows.map((r) => ({
          name: r.name.trim(),
          quantity: Number(r.quantity) || 0,
          unitCost: Number(r.unitCost) || 0,
          inventoryItemId: r.inventoryItemId === "none" ? undefined : r.inventoryItemId,
        })),
      };
      return editing
        ? apiJson<Order>(`/api/orders/${editing.id}`, "PATCH", body)
        : apiJson<Order>("/api/orders", "POST", body);
    },
    onSuccess: () => {
      toast({ title: editing ? "Purchase order updated" : "Purchase order created as draft" });
      setCreateOpen(false);
      setEditing(null);
      rq.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not save purchase order", description: e.message, variant: "destructive" }),
  });

  const sendOrder = useMutation({
    mutationFn: (id: string) => apiJson<Order>(`/api/orders/${id}/send`, "POST", {}),
    onSuccess: (o) => {
      toast({ title: `Order ${o.poNumber} sent to vendor` });
      rq.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not send order", description: e.message, variant: "destructive" }),
  });

  const receive = useMutation({
    mutationFn: () => {
      const items = (receiveOrder?.items ?? [])
        .map((i) => ({
          orderItemId: i.id,
          quantity: Number(receiveLines[i.id] ?? "0") || 0,
          condition: receiveConditions[i.id] ?? "GOOD",
        }))
        .filter((l) => l.quantity > 0);
      return apiJson(`/api/orders/${receiveOrder?.id}/receive`, "POST", {
        items,
        invoiceNumber: invoiceNumber.trim() || undefined,
        notes: receiveNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Goods received", description: "Stock updated for linked inventory items." });
      setReceiveOrder(null);
      rq.invalidateQueries({ queryKey: ["orders"] });
      rq.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not receive goods", description: e.message, variant: "destructive" }),
  });

  const canSavePo =
    !saveOrder.isPending &&
    rows.length > 0 &&
    rows.every((r) => r.name.trim() && Number(r.quantity) > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Draft" value={stats.draft} icon={FileText} />
        <StatCard title="Ordered" value={stats.ordered} icon={Send} />
        <StatCard title="Awaiting receipt" value={stats.awaiting} icon={PackageCheck} />
        <StatCard title="Received" value={stats.received} icon={Store} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Purchase orders</CardTitle>
          {canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              New PO
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {orders.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : orders.isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load purchase orders"
                description={orders.error instanceof Error ? orders.error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => orders.refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={FileText}
                title="No purchase orders"
                description="Create a purchase order, send it to the vendor, then record receipts."
              />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>PO number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Ordered</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((o) => {
                    const expanded = expandedId === o.id;
                    const receipts = o._count?.goodsReceipts ?? 0;
                    return (
                      <Fragment key={o.id}>
                        <TableRow>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={expanded ? `Collapse ${o.poNumber}` : `Expand ${o.poNumber}`}
                              onClick={() => setExpandedId(expanded ? null : o.id)}
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-medium">{o.poNumber}</TableCell>
                          <TableCell>{o.vendor?.name ?? "—"}</TableCell>
                          <TableCell>{o.items.length}</TableCell>
                          <TableCell className="whitespace-nowrap">{money(o.totalCost)}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(o.orderedAt)}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(o.expectedAt)}</TableCell>
                          <TableCell>
                            <StatusBadge status={o.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1.5">
                              {o.status === "DRAFT" && canCreate ? (
                                <Button size="sm" variant="outline" className="h-7" onClick={() => openEdit(o)}>
                                  Edit
                                </Button>
                              ) : null}
                              {o.status === "DRAFT" && canSend ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950"
                                  disabled={sendOrder.isPending}
                                  onClick={() => sendOrder.mutate(o.id)}
                                >
                                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                                  Send
                                </Button>
                              ) : null}
                              {(o.status === "ORDERED" || o.status === "PARTIALLY_RECEIVED") && canReceive ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                                  onClick={() => openReceive(o)}
                                >
                                  <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                  Receive
                                </Button>
                              ) : null}
                              {receipts > 0 ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() => setReceiptsOrder(o.id)}
                                  aria-label={`View ${receipts} receipts for ${o.poNumber}`}
                                >
                                  Receipts ({receipts})
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30 p-4">
                              <div className="space-y-3">
                                {o.notes ? <p className="text-sm text-muted-foreground">{o.notes}</p> : null}
                                {o.items.map((i) => {
                                  const pct = i.quantity > 0 ? Math.min(100, Math.round((i.receivedQuantity / i.quantity) * 100)) : 0;
                                  return (
                                    <div key={i.id} className="space-y-1">
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                        <span className="font-medium">{i.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {i.receivedQuantity} / {i.quantity} received · {money(i.unitCost)} each
                                        </span>
                                      </div>
                                      <Progress value={pct} className="h-2" aria-label={`${pct}% of ${i.name} received`} />
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New / edit PO dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.poNumber}` : "New purchase order"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Draft orders can be edited until they are sent to the vendor."
                : "Orders start as drafts — send them to the vendor when ready."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Vendor</Label>
                <Select value={form.vendorId} onValueChange={(v) => setForm({ ...form, vendorId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor yet</SelectItem>
                    {(vendors.data ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="po-expected">Expected at</Label>
                <Input
                  id="po-expected"
                  type="date"
                  value={form.expectedAt}
                  onChange={(e) => setForm({ ...form, expectedAt: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              <div className="hidden sm:grid grid-cols-[1fr_90px_110px_1fr_36px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                <span>Name</span>
                <span>Qty</span>
                <span>Unit cost (₹)</span>
                <span>Inventory item</span>
                <span />
              </div>
              {rows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_90px_110px_1fr_36px] gap-2">
                  <Input
                    value={row.name}
                    onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...row, name: e.target.value };
                      setRows(next);
                    }}
                    placeholder="Item name"
                    aria-label={`Item ${idx + 1} name`}
                  />
                  <Input
                    type="number"
                    min="1"
                    value={row.quantity}
                    onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...row, quantity: e.target.value };
                      setRows(next);
                    }}
                    aria-label={`Item ${idx + 1} quantity`}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...row, unitCost: e.target.value };
                      setRows(next);
                    }}
                    aria-label={`Item ${idx + 1} unit cost`}
                  />
                  <Select
                    value={row.inventoryItemId}
                    onValueChange={(v) => {
                      const next = [...rows];
                      const linked = (inventoryItems.data ?? []).find((i) => i.id === v);
                      next[idx] = {
                        ...row,
                        inventoryItemId: v,
                        name: v === "none" ? row.name : (linked?.name ?? row.name),
                      };
                      setRows(next);
                    }}
                  >
                    <SelectTrigger aria-label={`Item ${idx + 1} inventory link`}>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {(inventoryItems.data ?? []).map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name} ({i.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                    disabled={rows.length <= 1}
                    onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                    aria-label={`Remove item row ${idx + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-fit" onClick={() => setRows([...rows, { ...emptyItemRow }])}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add row
              </Button>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="po-notes">Notes</Label>
              <Textarea
                id="po-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Delivery instructions, references..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saveOrder.isPending}>
              Cancel
            </Button>
            <Button onClick={() => saveOrder.mutate()} disabled={!canSavePo}>
              {saveOrder.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              {editing ? "Save changes" : "Create draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive goods dialog */}
      <Dialog open={!!receiveOrder} onOpenChange={(o) => !o && setReceiveOrder(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Receive goods</DialogTitle>
            <DialogDescription>
              {receiveOrder ? `${receiveOrder.poNumber} — enter received quantities per line` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="hidden sm:grid grid-cols-[1fr_70px_90px_90px_120px] gap-2 px-1 text-xs font-medium text-muted-foreground">
              <span>Item</span>
              <span>Ordered</span>
              <span>Received</span>
              <span>This receipt</span>
              <span>Condition</span>
            </div>
            {(receiveOrder?.items ?? []).map((i) => {
              const remaining = Math.max(0, i.quantity - i.receivedQuantity);
              return (
                <div key={i.id} className="grid grid-cols-2 sm:grid-cols-[1fr_70px_90px_90px_120px] gap-2 items-center">
                  <span className="text-sm font-medium col-span-2 sm:col-span-1 truncate" title={i.name}>
                    {i.name}
                  </span>
                  <span className="text-sm text-muted-foreground">{i.quantity}</span>
                  <span className="text-sm text-muted-foreground">{i.receivedQuantity}</span>
                  <Input
                    type="number"
                    min="0"
                    max={remaining}
                    value={receiveLines[i.id] ?? "0"}
                    onChange={(e) => setReceiveLines({ ...receiveLines, [i.id]: e.target.value })}
                    aria-label={`Receive quantity for ${i.name}`}
                  />
                  <Select
                    value={receiveConditions[i.id] ?? "GOOD"}
                    onValueChange={(v) => setReceiveConditions({ ...receiveConditions, [i.id]: v })}
                  >
                    <SelectTrigger aria-label={`Condition for ${i.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECEIPT_CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="grid gap-2">
                <Label htmlFor="rc-invoice">Invoice number</Label>
                <Input
                  id="rc-invoice"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-2024-018"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rc-notes">Notes</Label>
                <Input
                  id="rc-notes"
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOrder(null)} disabled={receive.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => receive.mutate()}
              disabled={receive.isPending || (receiveOrder?.items ?? []).every((i) => !(Number(receiveLines[i.id] ?? "0") > 0))}
            >
              {receive.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Post receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipts viewer */}
      <ReceiptsDialog orderId={receiptsOrder} onClose={() => setReceiptsOrder(null)} />
    </div>
  );
}

function ReceiptsDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const detail = useQuery<Order>({
    queryKey: ["order", orderId],
    queryFn: () => apiFetch<Order>(`/api/orders/${orderId}`),
    enabled: !!orderId,
  });

  const order = detail.data;
  const itemName = (orderItemId: string) =>
    order?.items.find((i) => i.id === orderItemId)?.name ?? orderItemId;

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Goods receipts</DialogTitle>
          <DialogDescription>{order ? order.poNumber : "Loading..."}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-3 overflow-y-auto py-2">
          {detail.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : detail.isError ? (
            <EmptyState
              icon={TriangleAlert}
              title="Could not load receipts"
              description={detail.error instanceof Error ? detail.error.message : "Request failed"}
            />
          ) : (order?.goodsReceipts?.length ?? 0) === 0 ? (
            <EmptyState icon={PackageCheck} title="No receipts yet" description="Receipts appear once goods are checked in." />
          ) : (
            (order?.goodsReceipts ?? []).map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {fmtDate(r.receivedAt)} · {r.receivedBy?.name ?? "—"}
                  </span>
                  {r.invoiceNumber ? (
                    <span className="font-mono text-xs text-muted-foreground">{r.invoiceNumber}</span>
                  ) : null}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {r.items.map((ri) => (
                    <li key={ri.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{itemName(ri.orderItemId)}</span>
                      <span className="whitespace-nowrap text-xs">
                        {ri.quantity} · {ri.condition}
                      </span>
                    </li>
                  ))}
                </ul>
                {r.notes ? <p className="mt-2 text-xs text-muted-foreground">{r.notes}</p> : null}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Vendors tab ------------------------------ */

const emptyVendorForm = { name: "", contactEmail: "", phone: "", address: "", category: "EQUIPMENT", rating: "4" };

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rating ${rating} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < full ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-muted-foreground/40"
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function VendorsTab({ perms }: { perms: string[] }) {
  const rq = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyVendorForm);
  const canManage = perms.includes("procurement.approve");

  const vendors = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: () => apiFetch<Vendor[]>("/api/vendors") });

  const create = useMutation({
    mutationFn: () =>
      apiJson("/api/vendors", "POST", {
        name: form.name.trim(),
        contactEmail: form.contactEmail.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        category: form.category,
        rating: Math.min(5, Math.max(0, Number(form.rating) || 0)),
      }),
    onSuccess: () => {
      toast({ title: "Vendor added" });
      setOpen(false);
      setForm(emptyVendorForm);
      rq.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e: Error) =>
      toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const list = vendors.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Vendors</CardTitle>
        {canManage ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Add Vendor
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {vendors.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : vendors.isError ? (
          <div className="p-4">
            <EmptyState
              icon={TriangleAlert}
              title="Could not load vendors"
              description={vendors.error instanceof Error ? vendors.error.message : "Request failed"}
              action={
                <Button variant="outline" onClick={() => vendors.refetch()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Store} title="No vendors registered" description="Add vendors to attach them to purchase orders." />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Contact email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.category ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.contactEmail ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.phone ?? "—"}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Stars rating={Number(v.rating ?? 0)} />
                        <span className="text-xs text-muted-foreground">{Number(v.rating ?? 0).toFixed(1)}</span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
            <DialogDescription>Register a supplier for equipment, chemicals or consumables.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="v-name">Name</Label>
              <Input
                id="v-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="SciTech Supplies Pvt Ltd"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="v-email">Contact email</Label>
                <Input
                  id="v-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  placeholder="sales@scitech.example"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="v-phone">Phone</Label>
                <Input
                  id="v-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="v-addr">Address</Label>
              <Input
                id="v-addr"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="City, state"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_CATEGORY.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="v-rating">Rating (0-5)</Label>
                <Input
                  id="v-rating"
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  value={form.rating}
                  onChange={(e) => setForm({ ...form, rating: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.name.trim()}>
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Add vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* --------------------------------- Page ----------------------------------- */

function ProcurementContent() {
  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });
  const perms = me.data?.permissions ?? [];

  return (
    <Tabs defaultValue="requests" className="space-y-4">
      <TabsList>
        <TabsTrigger value="requests" className="gap-2">
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          Requests
        </TabsTrigger>
        <TabsTrigger value="orders" className="gap-2">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Purchase Orders
        </TabsTrigger>
        <TabsTrigger value="vendors" className="gap-2">
          <Store className="h-4 w-4" aria-hidden="true" />
          Vendors
        </TabsTrigger>
      </TabsList>
      <TabsContent value="requests">
        <RequestsTab perms={perms} />
      </TabsContent>
      <TabsContent value="orders">
        <OrdersTab perms={perms} />
      </TabsContent>
      <TabsContent value="vendors">
        <VendorsTab perms={perms} />
      </TabsContent>
    </Tabs>
  );
}

export default function ProcurementPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Procurement" description="Purchase requests, purchase orders and vendor management." />
        <ProcurementContent />
      </div>
    </QueryClientProvider>
  );
}
