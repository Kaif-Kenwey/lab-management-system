"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  FlaskConical,
  Loader2,
  MapPin,
  Package,
  Pencil,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { LAB_STATUS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

type EquipmentRow = {
  id: string;
  name: string;
  code: string;
  category: string;
  status: string;
};

type InventoryRow = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  minQuantity: number;
};

type SessionRow = {
  id: string;
  title: string;
  scheduledAt: string;
  room?: string | null;
  status: string;
};

type LabDetail = {
  id: string;
  name: string;
  code: string;
  location?: string | null;
  capacity: number;
  status: string;
  description?: string | null;
  manager?: { name?: string } | null;
  equipment?: EquipmentRow[];
  inventoryItems?: InventoryRow[];
  chemicals?: unknown[];
  sessions?: SessionRow[];
};

type Me = { session: { userId: string; role: string; name: string } };

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Request failed");
  }
  return res.json();
}

function fmt(v?: string | null, pattern: string = "PPP") {
  if (!v) return "—";
  try {
    return format(new Date(v), pattern);
  } catch {
    return "—";
  }
}

const emptyForm = { name: "", code: "", location: "", capacity: "", description: "", status: "ACTIVE" };

export default function LabDetailPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <LabDetailContent />
    </QueryClientProvider>
  );
}

function LabDetailContent() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => fetcher("/api/auth/me") });
  const lab = useQuery<LabDetail>({
    queryKey: ["lab", id],
    queryFn: () => fetcher(`/api/labs/${id}`),
    enabled: !!id,
  });

  const role = me.data?.session?.role;
  const canManage = role === "ADMIN" || role === "LAB_MANAGER";

  useEffect(() => {
    if (lab.isError) {
      toast({
        title: "Failed to load lab",
        description: lab.error instanceof Error ? lab.error.message : "Something went wrong",
        variant: "destructive",
      });
    }
  }, [lab.isError, lab.error]);

  const updateLab = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/labs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          location: form.location.trim() || null,
          capacity: Number(form.capacity) || 0,
          description: form.description.trim() || null,
          status: form.status,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Failed to update lab");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lab", id] });
      queryClient.invalidateQueries({ queryKey: ["labs"] });
      toast({ title: "Lab updated" });
      setEditOpen(false);
    },
    onError: (e: Error) =>
      toast({ title: "Could not update lab", description: e.message, variant: "destructive" }),
  });

  if (lab.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (lab.isError || !lab.data) {
    return (
      <div className="space-y-6">
        <Link
          href="/labs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to labs
        </Link>
        <EmptyState
          icon={FlaskConical}
          title="Lab not found"
          description="This lab may have been removed or you do not have access to it."
        />
      </div>
    );
  }

  const data = lab.data;
  const equipmentCount = data.equipment?.length ?? 0;
  const inventoryCount = data.inventoryItems?.length ?? 0;
  const chemicalsCount = Array.isArray(data.chemicals) ? data.chemicals.length : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/labs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to labs
      </Link>

      <PageHeader
        title={data.name}
        description={`${data.code}${data.manager?.name ? ` · Managed by ${data.manager.name}` : " · No manager assigned"}`}
        actions={<StatusBadge status={data.status} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Equipment" value={equipmentCount} icon={Wrench} />
        <StatCard title="Inventory items" value={inventoryCount} icon={Package} />
        <StatCard title="Chemicals" value={chemicalsCount} icon={FlaskConical} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Overview</CardTitle>
              {canManage ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm({
                      name: data.name ?? "",
                      code: data.code ?? "",
                      location: data.location ?? "",
                      capacity: String(data.capacity ?? 0),
                      description: data.description ?? "",
                      status: data.status ?? "ACTIVE",
                    });
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Edit
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="text-sm mt-1">{data.description || "No description provided."}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Location</Label>
                    <p className="text-sm mt-0.5">{data.location || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Capacity</Label>
                    <p className="text-sm mt-0.5">{data.capacity} people</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <UserCheck className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Manager</Label>
                    <p className="text-sm mt-0.5">{data.manager?.name || "Unassigned"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipment" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {equipmentCount === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Wrench}
                    title="No equipment"
                    description="Equipment assigned to this lab will appear here."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.equipment!.map((eq) => (
                        <TableRow key={eq.id}>
                          <TableCell className="font-medium">
                            <Link href={`/equipment/${eq.id}`} className="hover:underline">
                              {eq.name}
                            </Link>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{eq.code}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {eq.category.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={eq.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {inventoryCount === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Package}
                    title="No inventory items"
                    description="Consumables and spares stocked in this lab will appear here."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.inventoryItems!.map((item) => {
                        const low = item.quantity <= (item.minQuantity ?? 0);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                            <TableCell>
                              <span
                                className={
                                  low
                                    ? "font-medium text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground"
                                }
                              >
                                {item.quantity} {item.unit || "pcs"}
                              </span>
                              {low ? (
                                <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                                  (min {item.minQuantity})
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              {low ? <StatusBadge status="WARNING" /> : <StatusBadge status="ACTIVE" />}
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
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {!data.sessions || data.sessions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={FlaskConical}
                    title="No sessions"
                    description="Scheduled lab sessions will appear here."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.sessions.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.title}</TableCell>
                          <TableCell className="text-muted-foreground">{fmt(s.scheduledAt, "PPP p")}</TableCell>
                          <TableCell className="text-muted-foreground">{s.room || "—"}</TableCell>
                          <TableCell>
                            <StatusBadge status={s.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit lab</DialogTitle>
            <DialogDescription>Update lab details and status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-lab-name">Name</Label>
              <Input
                id="edit-lab-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-lab-code">Code</Label>
                <Input
                  id="edit-lab-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lab-capacity">Capacity</Label>
                <Input
                  id="edit-lab-capacity"
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lab-location">Location</Label>
              <Input
                id="edit-lab-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lab-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger id="edit-lab-status" className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {LAB_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lab-description">Description</Label>
              <Textarea
                id="edit-lab-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateLab.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => updateLab.mutate()}
              disabled={form.name.trim() === "" || form.code.trim() === "" || updateLab.isPending}
            >
              {updateLab.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
