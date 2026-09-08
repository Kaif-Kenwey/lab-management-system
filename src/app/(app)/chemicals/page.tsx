"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient as useRQClient } from "@tanstack/react-query";
import { Beaker, FlaskConical, Plus, Search, Loader2, TriangleAlert } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/hooks/use-toast";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Request failed");
  }
  return res.json();
}

type Chemical = {
  id: string;
  name: string;
  casNumber?: string | null;
  quantity: number;
  unit?: string | null;
  hazardClass?: string | null;
  expiryDate?: string | null;
  storageLocation?: string | null;
  lab?: { name: string; code: string } | null;
};

type Lab = { id: string; name: string; code: string };

const HAZARD_CLASS = ["LOW", "FLAMMABLE", "CORROSIVE", "TOXIC", "REACTIVE"];

function ChemicalsContent() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [q, setQ] = useState("");
  const [hazard, setHazard] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    casNumber: "",
    labId: "none",
    quantity: "0",
    unit: "ml",
    hazardClass: "LOW",
    expiryDate: "",
    storageLocation: "",
  });

  const { data: labs } = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => fetcher("/api/labs") });

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (hazard !== "all") params.set("hazardClass", hazard);
  const qs = params.toString();

  const { data: chemicals, isLoading, isError, error, refetch, isRefetching } = useQuery<Chemical[]>({
    queryKey: ["chemicals", q, hazard],
    queryFn: () => fetcher(`/api/chemicals${qs ? `?${qs}` : ""}`),
  });

  const list = chemicals ?? [];
  const expiringSoon = list.filter((c) => c.expiryDate && new Date(c.expiryDate) < new Date()).length;

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/chemicals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Create failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Chemical added" });
      setOpen(false);
      setForm({ name: "", casNumber: "", labId: "none", quantity: "0", unit: "ml", hazardClass: "LOW", expiryDate: "", storageLocation: "" });
      rq.invalidateQueries({ queryKey: ["chemicals"] });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total chemicals" value={list.length} icon={FlaskConical} />
        <StatCard title="Expired" value={expiringSoon} icon={TriangleAlert} hint={expiringSoon > 0 ? "Safe disposal required" : "None expired"} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Chemical register</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, CAS, lab..." className="pl-8 sm:w-64" />
            </div>
            <Select value={hazard} onValueChange={setHazard}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="All hazards" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All hazard classes</SelectItem>
                {HAZARD_CLASS.map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus className="h-4 w-4" />
                  Add Chemical
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add chemical</DialogTitle>
                  <DialogDescription>Register a chemical with its hazard classification.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label htmlFor="chem-name">Name</Label>
                    <Input id="chem-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sodium hydroxide" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="chem-cas">CAS number</Label>
                      <Input id="chem-cas" value={form.casNumber} onChange={(e) => setForm({ ...form, casNumber: e.target.value })} placeholder="1310-73-2" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Hazard class</Label>
                      <Select value={form.hazardClass} onValueChange={(v) => setForm({ ...form, hazardClass: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HAZARD_CLASS.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                      <Label htmlFor="chem-qty">Quantity</Label>
                      <Input id="chem-qty" type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="chem-unit">Unit</Label>
                      <Input id="chem-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="ml / g / L" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="chem-exp">Expiry date</Label>
                      <Input id="chem-exp" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="chem-loc">Storage location</Label>
                      <Input id="chem-loc" value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} placeholder="Cabinet A1" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() =>
                      create.mutate({
                        name: form.name,
                        casNumber: form.casNumber || undefined,
                        labId: form.labId === "none" ? undefined : form.labId,
                        quantity: Number(form.quantity) || 0,
                        unit: form.unit || undefined,
                        hazardClass: form.hazardClass,
                        expiryDate: form.expiryDate || undefined,
                        storageLocation: form.storageLocation || undefined,
                      })
                    }
                    disabled={create.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Add chemical
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
                icon={TriangleAlert}
                title="Could not load chemicals"
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
              <EmptyState icon={Beaker} title="No chemicals found" description="Add a chemical or adjust your filters." />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>CAS number</TableHead>
                    <TableHead>Lab</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Hazard</TableHead>
                    <TableHead>Expiry date</TableHead>
                    <TableHead>Storage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((c) => {
                    const expired = c.expiryDate ? new Date(c.expiryDate) < new Date() : false;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="font-mono text-xs">{c.casNumber ?? "—"}</TableCell>
                        <TableCell>{c.lab?.name ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {c.quantity} {c.unit ?? ""}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.hazardClass ?? "LOW"} />
                        </TableCell>
                        <TableCell className={expired ? "font-medium text-red-600 dark:text-red-400" : ""}>
                          {c.expiryDate ? format(new Date(c.expiryDate), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{c.storageLocation ?? "—"}</TableCell>
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

export default function ChemicalsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Chemicals" description="Chemical register with hazard classes, quantities and expiry tracking." />
        <ChemicalsContent />
      </div>
    </QueryClientProvider>
  );
}
