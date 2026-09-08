"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient as useRQClient } from "@tanstack/react-query";
import { Package, PackageSearch, Plus, Minus, Trash2, Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  minQuantity?: number | null;
  location?: string | null;
  lab?: { name: string; code: string } | null;
};

type Lab = { id: string; name: string; code: string };

const INVENTORY_CATEGORY = ["CONSUMABLE", "SPARE", "STATIONERY", "SAFETY"];

function InventoryContent() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    labId: "none",
    category: "CONSUMABLE",
    quantity: "0",
    unit: "units",
    minQuantity: "0",
    location: "",
  });

  const { data: me } = useQuery<{ session: { role: string } }>({
    queryKey: ["me"],
    queryFn: () => fetcher("/api/auth/me"),
  });
  const role = me?.session?.role;
  const canManage = role === "ADMIN" || role === "LAB_MANAGER";

  const { data: labs } = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => fetcher("/api/labs") });

  const { data: items, isLoading, isError, error, refetch, isRefetching } = useQuery<InventoryItem[]>({
    queryKey: ["inventory", q],
    queryFn: () => fetcher(`/api/inventory${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });

  const list = (items ?? []).filter((i) => (lowOnly ? Number(i.quantity) <= Number(i.minQuantity ?? 0) : true));
  const lowCount = (items ?? []).filter((i) => Number(i.quantity) <= Number(i.minQuantity ?? 0)).length;

  const adjust = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      }).then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Update failed");
        }
        return res.json();
      }),
    onSuccess: () => rq.invalidateQueries({ queryKey: ["inventory"] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/inventory/${id}`, { method: "DELETE" }).then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Delete failed");
        }
        return res.json();
      }),
    onSuccess: () => {
      toast({ title: "Item deleted" });
      rq.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  async function createItem() {
    if (!form.name.trim() || !form.sku.trim() || form.labId === "none") {
      toast({ title: "Missing fields", description: "Name, SKU and lab are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          sku: form.sku,
          labId: form.labId,
          category: form.category,
          quantity: Number(form.quantity) || 0,
          unit: form.unit || undefined,
          minQuantity: Number(form.minQuantity) || 0,
          location: form.location || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Create failed");
      toast({ title: "Item added" });
      setOpen(false);
      setForm({ name: "", sku: "", labId: "none", category: "CONSUMABLE", quantity: "0", unit: "units", minQuantity: "0", location: "" });
      rq.invalidateQueries({ queryKey: ["inventory"] });
    } catch (e) {
      toast({ title: "Create failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total items" value={items?.length ?? 0} icon={Package} />
        <StatCard title="Low stock count" value={lowCount} icon={PackageSearch} hint={lowCount > 0 ? "Needs restocking" : "All stocked"} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Inventory items</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items, SKU, lab..."
                className="pl-8 sm:w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="low-stock" checked={lowOnly} onCheckedChange={setLowOnly} />
              <Label htmlFor="low-stock" className="text-sm text-muted-foreground whitespace-nowrap">
                Low stock only
              </Label>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus className="h-4 w-4" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add inventory item</DialogTitle>
                  <DialogDescription>Register a new consumable, spare or supply item.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label htmlFor="inv-name">Name</Label>
                    <Input id="inv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Beaker set 250ml" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="inv-sku">SKU</Label>
                    <Input id="inv-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="INV-0001" />
                  </div>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVENTORY_CATEGORY.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inv-unit">Unit</Label>
                      <Input id="inv-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="units" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="inv-qty">Quantity</Label>
                      <Input id="inv-qty" type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="inv-min">Min quantity</Label>
                      <Input id="inv-min" type="number" min="0" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="inv-loc">Location</Label>
                    <Input id="inv-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Shelf B2" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={createItem} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Add item
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
                icon={PackageSearch}
                title="Could not load inventory"
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
              <EmptyState icon={Package} title="No items found" description="Add an inventory item or adjust your search." />
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
                  {list.map((item) => {
                    const low = Number(item.quantity) <= Number(item.minQuantity ?? 0);
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
                        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                        <TableCell>{item.lab?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.category?.replace(/_/g, " ") ?? "—"}</TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap">
                            {item.quantity} {item.unit ?? "units"}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.minQuantity ?? 0}</TableCell>
                        <TableCell className="text-muted-foreground">{item.location ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              disabled={adjust.isPending || Number(item.quantity) <= 0}
                              onClick={() => adjust.mutate({ id: item.id, quantity: Number(item.quantity) - 1 })}
                              aria-label={`Decrease ${item.name}`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              disabled={adjust.isPending}
                              onClick={() => adjust.mutate({ id: item.id, quantity: Number(item.quantity) + 1 })}
                              aria-label={`Increase ${item.name}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            {canManage ? (
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                                disabled={remove.isPending}
                                onClick={() => remove.mutate(item.id)}
                                aria-label={`Delete ${item.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  );
}

export default function InventoryPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Inventory" description="Track consumables, spares and supplies across all labs." />
        <InventoryContent />
      </div>
    </QueryClientProvider>
  );
}
