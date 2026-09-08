"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import QRCode from "qrcode";
import { format } from "date-fns";
import {
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  EQUIPMENT_CATEGORY,
  EQUIPMENT_CONDITION,
  EQUIPMENT_STATUS,
} from "@/lib/constants";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

type EquipmentRow = {
  id: string;
  name: string;
  code: string;
  category: string;
  status: string;
  condition: string;
  serialNumber?: string | null;
  manufacturer?: string | null;
  purchaseDate?: string | null;
  price: number;
  qrToken: string;
  labId: string;
  lab?: { name?: string; code?: string } | null;
};

type Lab = { id: string; name: string; code: string };

type Me = { session: { userId: string; role: string; name: string } };

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Request failed");
  }
  return res.json();
}

function humanize(s: string) {
  return s.replace(/_/g, " ");
}

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

const emptyForm = {
  name: "",
  code: "",
  labId: "",
  category: "GENERAL",
  manufacturer: "",
  serialNumber: "",
  price: "",
  condition: "GOOD",
  purchaseDate: "",
  status: "AVAILABLE",
};

export default function EquipmentPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <EquipmentContent />
    </QueryClientProvider>
  );
}

function EquipmentContent() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [labFilter, setLabFilter] = useState("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [qrRow, setQrRow] = useState<EquipmentRow | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrScanUrl, setQrScanUrl] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => fetcher("/api/auth/me") });
  const labs = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => fetcher("/api/labs") });

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (statusFilter !== "ALL") params.set("status", statusFilter);
  if (labFilter !== "ALL") params.set("labId", labFilter);
  const qs = params.toString();

  const equipment = useQuery<EquipmentRow[]>({
    queryKey: ["equipment", { q: q.trim(), status: statusFilter, labId: labFilter }],
    queryFn: () => fetcher(`/api/equipment${qs ? `?${qs}` : ""}`),
  });

  const role = me.data?.session?.role;
  const isAdmin = role === "ADMIN";
  const canEdit = role === "ADMIN" || role === "LAB_MANAGER" || role === "TECHNICIAN";

  useEffect(() => {
    if (equipment.isError) {
      toast({
        title: "Failed to load equipment",
        description: equipment.error instanceof Error ? equipment.error.message : "Something went wrong",
        variant: "destructive",
      });
    }
  }, [equipment.isError, equipment.error]);

  useEffect(() => {
    if (!qrRow) return;
    const scanUrl = `${window.location.origin}/scan/${qrRow.qrToken}`;
    let cancelled = false;
    QRCode.toDataURL(scanUrl)
      .then((url) => {
        if (!cancelled) {
          setQrScanUrl(scanUrl);
          setQrUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) setQrUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrRow]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(row: EquipmentRow) {
    setEditingId(row.id);
    setForm({
      name: row.name ?? "",
      code: row.code ?? "",
      labId: row.labId ?? "",
      category: row.category ?? "GENERAL",
      manufacturer: row.manufacturer ?? "",
      serialNumber: row.serialNumber ?? "",
      price: row.price != null ? String(row.price) : "",
      condition: row.condition ?? "GOOD",
      purchaseDate: row.purchaseDate ? format(new Date(row.purchaseDate), "yyyy-MM-dd") : "",
      status: row.status ?? "AVAILABLE",
    });
    setFormOpen(true);
  }

  const saveEquipment = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        labId: form.labId,
        category: form.category,
        manufacturer: form.manufacturer.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        price: Number(form.price) || 0,
        condition: form.condition,
        purchaseDate: form.purchaseDate || null,
        ...(editingId ? { status: form.status } : {}),
      };
      const res = await fetch(editingId ? `/api/equipment/${editingId}` : "/api/equipment", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast({ title: editingId ? "Equipment updated" : "Equipment added" });
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (e: Error) =>
      toast({ title: "Could not save equipment", description: e.message, variant: "destructive" }),
  });

  const deleteEquipment = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/equipment/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast({ title: "Equipment deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not delete equipment", description: e.message, variant: "destructive" }),
  });

  function handleDelete(row: EquipmentRow) {
    if (!window.confirm(`Delete equipment "${row.name}" (${row.code})? This cannot be undone.`)) return;
    deleteEquipment.mutate(row.id);
  }

  const rows = equipment.data ?? [];
  const canSubmit =
    form.name.trim() !== "" && form.code.trim() !== "" && form.labId !== "" && !saveEquipment.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipment"
        description="Instruments and machines across all labs"
        actions={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Add Equipment
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or code..."
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {EQUIPMENT_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {humanize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={labFilter} onValueChange={setLabFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Lab" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All labs</SelectItem>
            {(labs.data ?? []).map((lab) => (
              <SelectItem key={lab.id} value={lab.id}>
                {lab.name} ({lab.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {equipment.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wrench}
                title="No equipment found"
                description={
                  q.trim() || statusFilter !== "ALL" || labFilter !== "ALL"
                    ? "Try adjusting the search or filters."
                    : "Add your first piece of equipment to start tracking it."
                }
                action={
                  canEdit ? (
                    <Button variant="outline" onClick={openCreate}>
                      <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      Add Equipment
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
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Lab</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.code}</TableCell>
                      <TableCell className="text-muted-foreground">{row.lab?.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{humanize(row.category)}</TableCell>
                      <TableCell className="text-muted-foreground">{humanize(row.condition)}</TableCell>
                      <TableCell>{money(row.price)}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="View QR"
                            onClick={() => {
                              setQrUrl(null);
                              setQrRow(row);
                            }}
                          >
                            <QrCode className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          {canEdit ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Edit"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                          {isAdmin ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              title="Delete"
                              onClick={() => handleDelete(row)}
                              disabled={deleteEquipment.isPending}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update equipment details." : "Register a new piece of equipment in a lab."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="eq-name">Name</Label>
                <Input
                  id="eq-name"
                  placeholder="Digital Oscilloscope"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eq-code">Code</Label>
                <Input
                  id="eq-code"
                  placeholder="EQ-OSC-001"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Lab</Label>
                <Select value={form.labId} onValueChange={(v) => setForm({ ...form, labId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select lab" />
                  </SelectTrigger>
                  <SelectContent>
                    {(labs.data ?? []).map((lab) => (
                      <SelectItem key={lab.id} value={lab.id}>
                        {lab.name} ({lab.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_CATEGORY.map((c) => (
                      <SelectItem key={c} value={c}>
                        {humanize(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="eq-manufacturer">Manufacturer</Label>
                <Input
                  id="eq-manufacturer"
                  placeholder="Keysight"
                  value={form.manufacturer}
                  onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eq-serial">Serial number</Label>
                <Input
                  id="eq-serial"
                  placeholder="SN-0091"
                  value={form.serialNumber}
                  onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="eq-price">Price (₹)</Label>
                <Input
                  id="eq-price"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="45000"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
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
                <Label htmlFor="eq-purchase-date">Purchase date</Label>
                <Input
                  id="eq-purchase-date"
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                />
              </div>
            </div>
            {editingId ? (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {humanize(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveEquipment.isPending}>
              Cancel
            </Button>
            <Button onClick={() => saveEquipment.mutate()} disabled={!canSubmit}>
              {saveEquipment.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : null}
              {editingId ? "Save changes" : "Add equipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrRow} onOpenChange={(o) => { if (!o) { setQrRow(null); setQrUrl(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Equipment QR code</DialogTitle>
            <DialogDescription>Scan this code to identify the equipment in LabVault.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrUrl ? (
              <img
                alt="Equipment QR code"
                src={qrUrl}
                className="h-48 w-48 rounded-md border bg-white p-2"
              />
            ) : (
              <Skeleton className="h-48 w-48" />
            )}
            <div className="text-center">
              <div className="font-semibold">{qrRow?.name}</div>
              <div className="text-sm font-mono text-muted-foreground">{qrRow?.code}</div>
              {qrScanUrl ? (
                <div className="mt-1 text-xs break-all text-muted-foreground">{qrScanUrl}</div>
              ) : null}
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Print this QR code and affix it to the equipment body. Scanning it opens the equipment
              page in LabVault for identification and scan-based tracking.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              Print
            </Button>
            {qrRow ? (
              <Button asChild variant="outline">
                <Link href={`/equipment/${qrRow.id}`}>Open equipment page</Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => { setQrRow(null); setQrUrl(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
