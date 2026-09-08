"use client";

import { useState } from "react";
import Link from "next/link";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  FlaskConical,
  Loader2,
  MapPin,
  Plus,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

type Lab = {
  id: string;
  name: string;
  code: string;
  location?: string | null;
  capacity: number;
  status: string;
  description?: string | null;
  manager?: { name?: string } | null;
  _count?: { equipment?: number };
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

const emptyForm = { name: "", code: "", location: "", capacity: "", description: "" };

export default function LabsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <LabsContent />
    </QueryClientProvider>
  );
}

function LabsContent() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => fetcher("/api/auth/me") });
  const labs = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => fetcher("/api/labs") });

  const role = me.data?.session?.role;
  const canManage = role === "ADMIN" || role === "LAB_MANAGER";

  const createLab = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          location: form.location.trim() || null,
          capacity: Number(form.capacity) || 0,
          description: form.description.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Failed to create lab");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labs"] });
      toast({ title: "Lab created" });
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) =>
      toast({ title: "Could not create lab", description: e.message, variant: "destructive" }),
  });

  const canSubmit = form.name.trim() !== "" && form.code.trim() !== "" && !createLab.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Labs"
        description="Laboratory spaces, capacity and assigned equipment"
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              New Lab
            </Button>
          ) : null
        }
      />

      {labs.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : labs.isError ? (
        <EmptyState
          icon={FlaskConical}
          title="Failed to load labs"
          description={labs.error instanceof Error ? labs.error.message : "Something went wrong"}
        />
      ) : !labs.data || labs.data.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No labs yet"
          description="Create your first lab to start tracking equipment, inventory and sessions."
          action={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                New Lab
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {labs.data.map((lab) => (
            <Link key={lab.id} href={`/labs/${lab.id}`} className="group block">
              <Card className="h-full py-4 transition-colors group-hover:border-primary/40">
                <CardContent className="space-y-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold leading-tight truncate">{lab.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{lab.code}</div>
                    </div>
                    <StatusBadge status={lab.status} />
                  </div>
                  <div className="grid gap-1.5 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{lab.location || "No location set"}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Capacity {lab.capacity}
                    </span>
                    <span className="flex items-center gap-2">
                      <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {lab._count?.equipment ?? 0} equipment
                    </span>
                    <span className="flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{lab.manager?.name || "Unassigned"}</span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Lab</DialogTitle>
            <DialogDescription>Register a laboratory space in your organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lab-name">Name</Label>
              <Input
                id="lab-name"
                placeholder="Physics Lab 1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="lab-code">Code</Label>
                <Input
                  id="lab-code"
                  placeholder="PHY-101"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lab-capacity">Capacity</Label>
                <Input
                  id="lab-capacity"
                  type="number"
                  min={0}
                  placeholder="30"
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lab-location">Location</Label>
              <Input
                id="lab-location"
                placeholder="Block C, Floor 2"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lab-description">Description</Label>
              <Textarea
                id="lab-description"
                rows={3}
                placeholder="What this lab is used for"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createLab.isPending}>
              Cancel
            </Button>
            <Button onClick={() => createLab.mutate()} disabled={!canSubmit}>
              {createLab.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
              ) : null}
              Create lab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
