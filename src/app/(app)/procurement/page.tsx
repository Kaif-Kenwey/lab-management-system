"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient as useRQClient } from "@tanstack/react-query";
import { ShoppingCart, Store, Plus, Loader2, TriangleAlert, Star, Banknote, PackageCheck, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type Vendor = { id: string; name: string; contactEmail?: string | null; phone?: string | null; address?: string | null; category?: string | null; rating?: number | null };
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

const VENDOR_CATEGORY = ["EQUIPMENT", "CHEMICALS", "CONSUMABLES", "SERVICES"];

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rating ${rating} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={i < full ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-muted-foreground/40"}
        />
      ))}
    </span>
  );
}

function PurchasesTab() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ itemName: "", quantity: "1", estimatedCost: "0", vendorId: "none", justification: "" });

  const { data: me } = useQuery<{ session: { role: string } }>({ queryKey: ["me"], queryFn: () => fetcher("/api/auth/me") });
  const role = me?.session?.role;
  const canApprove = role === "ADMIN" || role === "LAB_MANAGER";
  const canOrder = canApprove || role === "TECHNICIAN";

  const { data: vendors } = useQuery<Vendor[]>({ queryKey: ["vendors"], queryFn: () => fetcher("/api/vendors") });
  const { data: purchases, isLoading, isError, error, refetch, isRefetching } = useQuery<PurchaseRequest[]>({
    queryKey: ["purchases"],
    queryFn: () => fetcher("/api/purchases"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      fetch(`/api/purchases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Update failed");
        return d;
      }),
    onSuccess: (_d, vars) => {
      toast({ title: `Request ${vars.next.toLowerCase()}` });
      rq.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Create failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Request submitted" });
      setOpen(false);
      setForm({ itemName: "", quantity: "1", estimatedCost: "0", vendorId: "none", justification: "" });
      rq.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (e: Error) => toast({ title: "Submit failed", description: e.message, variant: "destructive" }),
  });

  const list = purchases ?? [];
  const pending = list.filter((p) => p.status === "SUBMITTED").length;
  const approvedValue = list
    .filter((p) => ["APPROVED", "ORDERED"].includes(p.status))
    .reduce((sum, p) => sum + Number(p.estimatedCost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total requests" value={list.length} icon={ShoppingCart} />
        <StatCard title="Awaiting approval" value={pending} icon={TriangleAlert} />
        <StatCard title="Approved value" value={`₹${approvedValue.toLocaleString("en-IN")}`} icon={Banknote} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Purchase requests</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="h-4 w-4" />
                New Request
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New purchase request</DialogTitle>
                <DialogDescription>Request an item or restocking for your lab.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="pr-item">Item name</Label>
                  <Input id="pr-item" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="pH buffer set" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="pr-qty">Quantity</Label>
                    <Input id="pr-qty" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pr-cost">Estimated cost (₹)</Label>
                    <Input id="pr-cost" type="number" min="0" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} />
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
                      {(vendors ?? []).map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pr-just">Justification</Label>
                  <Textarea id="pr-just" rows={3} value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} placeholder="Why is this purchase needed?" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() =>
                    create.mutate({
                      itemName: form.itemName,
                      quantity: Number(form.quantity) || 1,
                      estimatedCost: Number(form.estimatedCost) || 0,
                      vendorId: form.vendorId === "none" ? undefined : form.vendorId,
                      justification: form.justification || undefined,
                    })
                  }
                  disabled={create.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Submit request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load purchase requests"
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
              <EmptyState icon={ShoppingCart} title="No purchase requests" description="Submit a request when your lab needs supplies." />
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
                        <span className="block truncate" title={p.itemName}>{p.itemName}</span>
                      </TableCell>
                      <TableCell>{p.quantity ?? 1}</TableCell>
                      <TableCell>₹{Number(p.estimatedCost ?? 0).toLocaleString("en-IN")}</TableCell>
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
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {p.status === "APPROVED" && canOrder ? (
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
                          {p.status === "ORDERED" && canOrder ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                              disabled={setStatus.isPending}
                              onClick={() => setStatus.mutate({ id: p.id, next: "RECEIVED" })}
                            >
                              <PackageCheck className="h-3.5 w-3.5" />
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
    </div>
  );
}

function VendorsTab() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contactEmail: "", phone: "", address: "", category: "EQUIPMENT", rating: "4" });

  const { data: vendors, isLoading, isError, error, refetch, isRefetching } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => fetcher("/api/vendors"),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Create failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Vendor added" });
      setOpen(false);
      setForm({ name: "", contactEmail: "", phone: "", address: "", category: "EQUIPMENT", rating: "4" });
      rq.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const list = vendors ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Vendors</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add vendor</DialogTitle>
              <DialogDescription>Register a supplier for equipment, chemicals or consumables.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="v-name">Name</Label>
                <Input id="v-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="SciTech Supplies Pvt Ltd" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="v-email">Contact email</Label>
                  <Input id="v-email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="sales@scitech.example" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="v-phone">Phone</Label>
                  <Input id="v-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="v-addr">Address</Label>
                <Input id="v-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="City, state" />
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
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="v-rating">Rating (0-5)</Label>
                  <Input id="v-rating" type="number" min="0" max="5" step="0.5" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  create.mutate({
                    name: form.name,
                    contactEmail: form.contactEmail || undefined,
                    phone: form.phone || undefined,
                    address: form.address || undefined,
                    category: form.category,
                    rating: Math.min(5, Math.max(0, Number(form.rating) || 0)),
                  })
                }
                disabled={create.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add vendor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-4">
            <EmptyState
              icon={TriangleAlert}
              title="Could not load vendors"
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
            <EmptyState icon={Store} title="No vendors registered" description="Add vendors to attach them to purchase requests." />
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
    </Card>
  );
}

function ProcurementContent() {
  return (
    <Tabs defaultValue="requests" className="space-y-4">
      <TabsList>
        <TabsTrigger value="requests" className="gap-2">
          <ShoppingCart className="h-4 w-4" />
          Purchase Requests
        </TabsTrigger>
        <TabsTrigger value="vendors" className="gap-2">
          <Store className="h-4 w-4" />
          Vendors
        </TabsTrigger>
      </TabsList>
      <TabsContent value="requests">
        <PurchasesTab />
      </TabsContent>
      <TabsContent value="vendors">
        <VendorsTab />
      </TabsContent>
    </Tabs>
  );
}

export default function ProcurementPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Procurement" description="Purchase requests and vendor management." />
        <ProcurementContent />
      </div>
    </QueryClientProvider>
  );
}
