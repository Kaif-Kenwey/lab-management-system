"use client";

import { useEffect, useMemo, useState } from "react";
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
  ClipboardList,
  History,
  Loader2,
  Package,
  PackageSearch,
  Plus,
  Search,
  ShoppingCart,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiFetch, apiJson } from "@/lib/client";
import { INVENTORY_CATEGORY, INVENTORY_TX_TYPES } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";

type Me = { session: { userId: string; role: string; name: string }; permissions: string[] };
type Item = {
  id: string;
  name: string;
  sku: string;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  minQuantity?: number | null;
  location?: string | null;
  lab?: { id: string; name: string; code: string } | null;
  _count?: { transactions: number };
};
type Lab = { id: string; name: string; code: string };
type ReorderItem = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  minQuantity: number;
  unit?: string | null;
  lab?: { name: string; code: string } | null;
  suggestedOrderQty: number;
};
type ReorderResponse = {
  items: ReorderItem[];
  stats: {
    totalLowStock: number;
    totalSuggestedQty: number;
    byLab: { labId: string; labName: string; labCode: string; count: number; suggestedQty: number }[];
  };
};
type LedgerTx = {
  id: string;
  type: string;
  quantity: number;
  previousBalance: number;
  newBalance: number;
  reason?: string | null;
  createdAt: string;
  item?: { id: string; name: string; sku: string; unit?: string | null } | null;
  performedBy?: { id: string; name: string } | null;
  transferToLab?: { id: string; name: string; code: string } | null;
};
type LedgerPage = { items: LedgerTx[]; page: number; pageSize: number; total: number };

const emptyItemForm = {
  name: "",
  sku: "",
  labId: "none",
  category: "CONSUMABLE",
  quantity: "0",
  unit: "units",
  minQuantity: "0",
  location: "",
};

/** Ledger direction per type: IN emerald, OUT red, TRANSFER sky, ADJUSTMENT amber */
function txTone(type: string): string {
  switch (type) {
    case "RECEIPT":
    case "RETURN":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900";
    case "ISSUE":
    case "DAMAGE":
    case "EXPIRY":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900";
    case "TRANSFER":
      return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900";
    case "ADJUSTMENT":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700";
  }
}

function txQuantityLabel(tx: LedgerTx): string {
  const qty = Number(tx.quantity);
  if (tx.type === "RECEIPT" || tx.type === "RETURN") return `+${qty}`;
  if (tx.type === "ISSUE" || tx.type === "DAMAGE" || tx.type === "EXPIRY") return `-${qty}`;
  if (tx.type === "TRANSFER") return `-${qty}`;
  return qty > 0 ? `+${qty}` : `${qty}`;
}

function InventoryPageInner() {
  const rq = useQueryClient();

  // --- filters ---
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [labFilter, setLabFilter] = useState("all");

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // --- data ---
  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });
  const canAdjust = (me.data?.permissions ?? []).includes("inventory.adjust");

  const labs = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => apiFetch<Lab[]>("/api/labs") });

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (lowOnly) params.set("lowStock", "true");
  if (labFilter !== "all") params.set("labId", labFilter);
  const qs = params.toString();

  const items = useQuery<Item[]>({
    queryKey: ["inventory", { q: q.trim(), lowOnly, labId: labFilter }],
    queryFn: () => apiFetch<Item[]>(`/api/inventory${qs ? `?${qs}` : ""}`),
  });

  const reorder = useQuery<ReorderResponse>({
    queryKey: ["reorder"],
    queryFn: () => apiFetch<ReorderResponse>("/api/inventory/reorder"),
  });

  // Ledger movements today — computed client-side; page shows an em dash if unavailable.
  const todayTx = useQuery<LedgerPage>({
    queryKey: ["ledger-today"],
    queryFn: () => apiFetch<LedgerPage>("/api/inventory/transactions?pageSize=200"),
    retry: false,
  });
  const movementsToday = useMemo(() => {
    if (!todayTx.data?.items) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return todayTx.data.items.filter((t) => new Date(t.createdAt) >= start).length;
  }, [todayTx.data]);

  const rows = items.data ?? [];
  const lowCount = reorder.data?.stats.totalLowStock ?? rows.filter((i) => i.quantity <= (i.minQuantity ?? 0)).length;

  // --- dialogs ---
  const [createOpen, setCreateOpen] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [moveItem, setMoveItem] = useState<Item | null>(null);
  const [moveForm, setMoveForm] = useState({ type: "ISSUE", quantity: "1", reason: "", transferToLabId: "none" });
  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  const createItem = useMutation({
    mutationFn: () =>
      apiJson<Item>("/api/inventory", "POST", {
        name: itemForm.name.trim(),
        sku: itemForm.sku.trim(),
        labId: itemForm.labId,
        category: itemForm.category,
        quantity: Math.max(0, Number(itemForm.quantity) || 0),
        unit: itemForm.unit.trim() || undefined,
        minQuantity: Math.max(0, Number(itemForm.minQuantity) || 0),
        location: itemForm.location.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Item added to ledger" });
      setCreateOpen(false);
      setItemForm(emptyItemForm);
      rq.invalidateQueries({ queryKey: ["inventory"] });
      rq.invalidateQueries({ queryKey: ["reorder"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not add item", description: e.message, variant: "destructive" }),
  });

  const moveStock = useMutation({
    mutationFn: (item: Item) => {
      const isTransfer = moveForm.type === "TRANSFER";
      return apiJson<LedgerTx>(`/api/inventory/${item.id}/transactions`, "POST", {
        type: moveForm.type,
        quantity: Number(moveForm.quantity),
        reason: moveForm.reason.trim() || undefined,
        ...(isTransfer ? { transferToLabId: moveForm.transferToLabId } : {}),
      });
    },
    onSuccess: (tx) => {
      toast({
        title: "Stock moved",
        description: `New balance: ${tx.newBalance} ${tx.item?.unit ?? ""}`.trim(),
      });
      setMoveItem(null);
      setMoveForm({ type: "ISSUE", quantity: "1", reason: "", transferToLabId: "none" });
      rq.invalidateQueries({ queryKey: ["inventory"] });
      rq.invalidateQueries({ queryKey: ["ledger-today"] });
      rq.invalidateQueries({ queryKey: ["reorder"] });
      if (historyItem) rq.invalidateQueries({ queryKey: ["ledger", historyItem.id] });
    },
    onError: (e: Error) =>
      toast({ title: "Movement rejected", description: e.message, variant: "destructive" }),
  });

  const createPr = useMutation({
    mutationFn: (item: ReorderItem) =>
      apiJson("/api/purchases", "POST", {
        itemName: item.name,
        quantity: item.suggestedOrderQty,
        justification: "Auto from reorder suggestion",
      }),
    onSuccess: (_d, item) => {
      toast({ title: "Purchase request created", description: `${item.name} — suggested qty ${item.suggestedOrderQty}` });
      setRequestedIds((prev) => new Set(prev).add(item.id));
      rq.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not create request", description: e.message, variant: "destructive" }),
  });

  const transferLabs = (labs.data ?? []).filter((l) => l.id !== moveItem?.lab?.id);
  const isAdjustment = moveForm.type === "ADJUSTMENT";
  const isTransfer = moveForm.type === "TRANSFER";
  const moveQty = Number(moveForm.quantity);
  const canSubmitMove =
    !!moveItem &&
    Number.isFinite(moveQty) &&
    moveQty !== 0 &&
    (isAdjustment || moveQty > 0) &&
    (!isTransfer || moveForm.transferToLabId !== "none") &&
    !moveStock.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Ledger"
        description="Stock levels are driven by an immutable movement ledger — every change is recorded."
        actions={
          canAdjust ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              New Item
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total items" value={items.isLoading ? "—" : rows.length} icon={Package} />
        <StatCard
          title="Low stock"
          value={reorder.isLoading ? "—" : lowCount}
          icon={PackageSearch}
          hint={lowCount > 0 ? "Below minimum — review reorder list" : "All stocked"}
        />
        <StatCard
          title="Ledger movements today"
          value={movementsToday ?? "—"}
          icon={ClipboardList}
          hint="Receipts, issues, transfers and adjustments"
        />
        <StatCard
          title="Suggested reorder qty"
          value={reorder.isLoading ? "—" : (reorder.data?.stats.totalSuggestedQty ?? 0)}
          icon={ShoppingCart}
          hint="Across all low stock items"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Stock table */}
        <Card className="lg:col-span-3 self-start">
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Stock on hand</CardTitle>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:max-w-xs">
                <Search
                  className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, SKU, location..."
                  className="pl-8"
                  aria-label="Search stock items"
                />
              </div>
              <Select value={labFilter} onValueChange={setLabFilter}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Filter by lab">
                  <SelectValue placeholder="Lab" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All labs</SelectItem>
                  {(labs.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch id="low-stock-only" checked={lowOnly} onCheckedChange={setLowOnly} />
                <Label htmlFor="low-stock-only" className="whitespace-nowrap text-sm text-muted-foreground">
                  Low stock only
                </Label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {items.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : items.isError ? (
              <div className="p-4">
                <EmptyState
                  icon={TriangleAlert}
                  title="Could not load stock"
                  description={items.error instanceof Error ? items.error.message : "Request failed"}
                  action={
                    <Button variant="outline" onClick={() => items.refetch()}>
                      Retry
                    </Button>
                  }
                />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Package}
                  title="No stock items found"
                  description={
                    q.trim() || lowOnly || labFilter !== "all"
                      ? "Try adjusting the search or filters."
                      : "Add your first item to start the ledger."
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Lab</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Min</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((item) => {
                      const low = item.quantity <= (item.minQuantity ?? 0);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              {item.name}
                              {low ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                  low
                                </span>
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                          <TableCell className="text-muted-foreground">{item.lab?.name ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {(item.category ?? "—").replace(/_/g, " ")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">
                            {item.quantity} {item.unit ?? ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.minQuantity ?? 0}</TableCell>
                          <TableCell className="text-muted-foreground">{item.location ?? "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {canAdjust ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Move stock"
                                  aria-label={`Move stock for ${item.name}`}
                                  onClick={() => {
                                    setMoveForm({ type: "ISSUE", quantity: "1", reason: "", transferToLabId: "none" });
                                    setMoveItem(item);
                                  }}
                                >
                                  <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="History"
                                aria-label={`View ledger history for ${item.name}`}
                                onClick={() => setHistoryItem(item)}
                              >
                                <History className="h-4 w-4" aria-hidden="true" />
                              </Button>
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

        {/* Reorder recommendations */}
        <Card className="lg:col-span-2 self-start">
          <CardHeader>
            <CardTitle className="text-base">Reorder recommendations</CardTitle>
            <CardDescription>
              Items at or below their minimum with a suggested order quantity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {reorder.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : reorder.isError ? (
              <EmptyState
                icon={TriangleAlert}
                title="Could not load recommendations"
                description={reorder.error instanceof Error ? reorder.error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => reorder.refetch()}>
                    Retry
                  </Button>
                }
              />
            ) : (reorder.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="All stocked"
                description="No item is at or below its minimum quantity. Nothing to reorder."
              />
            ) : (
              reorder.data!.items.map((s) => (
                <div key={s.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{s.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{s.sku}</div>
                    </div>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      low
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      On hand <span className="font-semibold text-foreground">{s.quantity}</span>
                    </span>
                    <span>
                      Min <span className="font-semibold text-foreground">{s.minQuantity}</span>
                      {s.unit ? ` ${s.unit}` : ""}
                    </span>
                    <span>
                      Suggested order{" "}
                      <span className="font-semibold text-foreground">
                        {s.suggestedOrderQty} {s.unit ?? ""}
                      </span>
                    </span>
                    <span>{s.lab?.name ?? "—"}</span>
                  </div>
                  <div className="mt-2.5">
                    {canAdjust ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={createPr.isPending || requestedIds.has(s.id)}
                        onClick={() => createPr.mutate(s)}
                      >
                        {createPr.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {requestedIds.has(s.id) ? "Request created" : "Create purchase request"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* New item dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New inventory item</DialogTitle>
            <DialogDescription>
              Register an item. Any initial quantity is recorded as the first RECEIPT in the ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="inv-name">Name</Label>
                <Input
                  id="inv-name"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="Beaker set 250ml"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-sku">SKU</Label>
                <Input
                  id="inv-sku"
                  value={itemForm.sku}
                  onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                  placeholder="INV-0001"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Lab</Label>
                <Select value={itemForm.labId} onValueChange={(v) => setItemForm({ ...itemForm, labId: v })}>
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
                <Label>Category</Label>
                <Select value={itemForm.category} onValueChange={(v) => setItemForm({ ...itemForm, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_CATEGORY.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="inv-qty">Initial qty</Label>
                <Input
                  id="inv-qty"
                  type="number"
                  min="0"
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-unit">Unit</Label>
                <Input
                  id="inv-unit"
                  value={itemForm.unit}
                  onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                  placeholder="units"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-min">Min qty</Label>
                <Input
                  id="inv-min"
                  type="number"
                  min="0"
                  value={itemForm.minQuantity}
                  onChange={(e) => setItemForm({ ...itemForm, minQuantity: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-loc">Location</Label>
              <Input
                id="inv-loc"
                value={itemForm.location}
                onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })}
                placeholder="Shelf B2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createItem.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => createItem.mutate()}
              disabled={
                createItem.isPending ||
                !itemForm.name.trim() ||
                !itemForm.sku.trim() ||
                itemForm.labId === "none"
              }
            >
              {createItem.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Add item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement dialog — the ledger UX */}
      <Dialog
        open={!!moveItem}
        onOpenChange={(o) => {
          if (!o) setMoveItem(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move stock</DialogTitle>
            <DialogDescription>
              {moveItem ? `${moveItem.name} — current balance ${moveItem.quantity} ${moveItem.unit ?? ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={moveForm.type} onValueChange={(v) => setMoveForm({ ...moveForm, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_TX_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mv-qty">Quantity</Label>
              <Input
                id="mv-qty"
                type="number"
                min={isAdjustment ? undefined : 1}
                value={moveForm.quantity}
                onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })}
              />
              {isAdjustment ? (
                <p className="text-xs text-muted-foreground">Signed correction — use a negative value to write stock down.</p>
              ) : null}
            </div>
            {isTransfer ? (
              <div className="grid gap-2">
                <Label>Destination lab</Label>
                <Select
                  value={moveForm.transferToLabId}
                  onValueChange={(v) => setMoveForm({ ...moveForm, transferToLabId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination lab" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem disabled value="none">
                      Select destination lab
                    </SelectItem>
                    {transferLabs.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="mv-reason">Reason</Label>
              <Input
                id="mv-reason"
                value={moveForm.reason}
                onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
                placeholder="Why is this stock moving?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveItem(null)} disabled={moveStock.isPending}>
              Cancel
            </Button>
            <Button onClick={() => moveItem && moveStock.mutate(moveItem)} disabled={!canSubmitMove}>
              {moveStock.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Submit movement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger history sheet */}
      <Sheet open={!!historyItem} onOpenChange={(o) => !o && setHistoryItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Ledger history</SheetTitle>
            <SheetDescription>
              {historyItem ? `${historyItem.name} — ${historyItem.sku}` : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {historyItem ? <LedgerHistory itemId={historyItem.id} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LedgerHistory({ itemId }: { itemId: string }) {
  const tx = useQuery<LedgerPage>({
    queryKey: ["ledger", itemId],
    queryFn: () => apiFetch<LedgerPage>(`/api/inventory/transactions?itemId=${itemId}&pageSize=100`),
  });

  if (tx.isLoading) {
    return (
      <div className="space-y-2 pt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (tx.isError) {
    return (
      <div className="pt-2">
        <EmptyState
          icon={TriangleAlert}
          title="Could not load ledger"
          description={tx.error instanceof Error ? tx.error.message : "Request failed"}
          action={
            <Button variant="outline" onClick={() => tx.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const rows = tx.data?.items ?? [];
  if (rows.length === 0) {
    return (
      <div className="pt-2">
        <EmptyState
          icon={History}
          title="No movements yet"
          description="Ledger entries will appear here as stock is received, issued or moved."
        />
      </div>
    );
  }

  return (
    <ol className="relative mt-4 space-y-4 border-l border-border pl-4">
      {rows.map((t) => (
        <li key={t.id} className="relative">
          <span
            className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground"
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={txTone(t.type)}>
              {t.type}
            </Badge>
            <span className="font-mono text-sm font-semibold">{txQuantityLabel(t)}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {t.previousBalance} → {t.newBalance}
            </span>
          </div>
          {t.transferToLab ? (
            <div className="mt-0.5 text-xs text-muted-foreground">Transferred to {t.transferToLab.name}</div>
          ) : null}
          {t.reason ? <div className="mt-0.5 text-sm text-muted-foreground">{t.reason}</div> : null}
          <div className="mt-0.5 text-xs text-muted-foreground">
            {t.performedBy?.name ?? "System"} · {format(new Date(t.createdAt), "PPp")}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function InventoryPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <InventoryPageInner />
    </QueryClientProvider>
  );
}
