"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient as useRQClient } from "@tanstack/react-query";
import { GraduationCap, FlaskConical, CalendarClock, ListChecks, Plus, Trash2, Loader2, TriangleAlert, UserPlus } from "lucide-react";
import { format } from "date-fns";
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

type Lab = { id: string; name: string; code: string };
type Experiment = {
  id: string;
  title: string;
  code: string;
  description?: string | null;
  status: string;
  lab?: { name: string; code: string } | null;
  instructor?: { name: string } | null;
  _count?: { sessions: number };
};
type LabSession = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin?: number | null;
  room?: string | null;
  status: string;
  experiment?: { title: string } | null;
  lab?: { name: string } | null;
  instructor?: { name: string } | null;
  attendance?: { id: string; studentName: string; status: string; markedAt: string }[];
};
type AttendanceRecord = { id: string; studentName: string; status: string; markedAt: string };

const EXPERIMENT_STATUS = ["DRAFT", "ACTIVE", "ARCHIVED"];
const ATTENDANCE_STATUS = ["PRESENT", "ABSENT", "LATE"];

function ExperimentsTab() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", code: "", labId: "none", description: "", status: "DRAFT" });

  const { data: labs } = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => fetcher("/api/labs") });
  const { data: experiments, isLoading, isError, error, refetch, isRefetching } = useQuery<Experiment[]>({
    queryKey: ["experiments"],
    queryFn: () => fetcher("/api/experiments"),
  });

  const { data: me } = useQuery<{ session: { role: string } }>({ queryKey: ["me"], queryFn: () => fetcher("/api/auth/me") });
  const canDelete = me?.session?.role === "ADMIN" || me?.session?.role === "LAB_MANAGER";

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/experiments/${id}`, { method: "DELETE" }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Delete failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Experiment deleted" });
      rq.invalidateQueries({ queryKey: ["experiments"] });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Create failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Experiment created" });
      setOpen(false);
      setForm({ title: "", code: "", labId: "none", description: "", status: "DRAFT" });
      rq.invalidateQueries({ queryKey: ["experiments"] });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const list = experiments ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Experiments</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4" />
              New Experiment
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New experiment</DialogTitle>
              <DialogDescription>Define an experiment that can be run as lab sessions.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="exp-title">Title</Label>
                  <Input id="exp-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Titration basics" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="exp-code">Code</Label>
                  <Input id="exp-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="EXP-101" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPERIMENT_STATUS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="exp-desc">Description</Label>
                <Textarea id="exp-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Learning objectives, safety notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  create.mutate({
                    title: form.title,
                    code: form.code,
                    labId: form.labId === "none" ? undefined : form.labId,
                    description: form.description || undefined,
                    status: form.status,
                  })
                }
                disabled={create.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create
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
              title="Could not load experiments"
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
            <EmptyState icon={FlaskConical} title="No experiments yet" description="Create your first experiment to start scheduling sessions." />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Lab</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Status</TableHead>
                  {canDelete ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{x.title}</TableCell>
                    <TableCell className="font-mono text-xs">{x.code}</TableCell>
                    <TableCell>{x.lab?.name ?? "—"}</TableCell>
                    <TableCell>{x.instructor?.name ?? "—"}</TableCell>
                    <TableCell>{x._count?.sessions ?? 0}</TableCell>
                    <TableCell>
                      <StatusBadge status={x.status} />
                    </TableCell>
                    {canDelete ? (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(x.id)}
                            aria-label={`Delete ${x.title}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
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

function SessionsTab() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ experimentId: "none", title: "", labId: "none", scheduledAt: "", durationMin: "60", room: "" });

  const { data: experiments } = useQuery<Experiment[]>({ queryKey: ["experiments"], queryFn: () => fetcher("/api/experiments") });
  const { data: labs } = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => fetcher("/api/labs") });
  const { data: sessions, isLoading, isError, error, refetch, isRefetching } = useQuery<LabSession[]>({
    queryKey: ["sessions"],
    queryFn: () => fetcher("/api/sessions"),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Create failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Session scheduled" });
      setOpen(false);
      setForm({ experimentId: "none", title: "", labId: "none", scheduledAt: "", durationMin: "60", room: "" });
      rq.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e: Error) => toast({ title: "Schedule failed", description: e.message, variant: "destructive" }),
  });

  const list = sessions ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Lab sessions</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4" />
              Schedule Session
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Schedule session</DialogTitle>
              <DialogDescription>Plan a lab session for an experiment.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Experiment</Label>
                <Select value={form.experimentId} onValueChange={(v) => setForm({ ...form, experimentId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select experiment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem disabled value="none">Select experiment</SelectItem>
                    {(experiments ?? []).map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.title} ({x.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ses-title">Title</Label>
                <Input id="ses-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Session title (optional)" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Lab (optional)</Label>
                  <Select value={form.labId} onValueChange={(v) => setForm({ ...form, labId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Use experiment lab" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Use experiment lab</SelectItem>
                      {(labs ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ses-room">Room</Label>
                  <Input id="ses-room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Room 204" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ses-when">Scheduled at</Label>
                  <Input id="ses-when" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ses-dur">Duration (min)</Label>
                  <Input id="ses-dur" type="number" min="15" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  create.mutate({
                    experimentId: form.experimentId === "none" ? undefined : form.experimentId,
                    title: form.title || undefined,
                    labId: form.labId === "none" ? undefined : form.labId,
                    scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
                    durationMin: Number(form.durationMin) || 60,
                    room: form.room || undefined,
                  })
                }
                disabled={create.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Schedule
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
              title="Could not load sessions"
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
            <EmptyState icon={CalendarClock} title="No sessions scheduled" description="Schedule a session for an experiment to see it here." />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Experiment</TableHead>
                  <TableHead>Lab / Room</TableHead>
                  <TableHead>Scheduled at</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell className="text-muted-foreground">{s.experiment?.title ?? "—"}</TableCell>
                    <TableCell>
                      {s.lab?.name ?? "—"}
                      {s.room ? <span className="block text-xs text-muted-foreground">{s.room}</span> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(s.scheduledAt), "EEE, dd MMM · HH:mm")}</TableCell>
                    <TableCell>{s.durationMin ? `${s.durationMin} min` : "—"}</TableCell>
                    <TableCell>{s.instructor?.name ?? "—"}</TableCell>
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
  );
}

function AttendanceTab() {
  const { toast } = useToast();
  const rq = useRQClient();
  const [sessionId, setSessionId] = useState("none");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ studentName: string; status: string }[]>([
    { studentName: "", status: "PRESENT" },
    { studentName: "", status: "PRESENT" },
    { studentName: "", status: "PRESENT" },
  ]);

  const { data: sessions, isLoading, isError, error, refetch, isRefetching } = useQuery<LabSession[]>({
    queryKey: ["sessions"],
    queryFn: () => fetcher("/api/sessions"),
  });

  const list = sessions ?? [];
  const selected = list.find((s) => s.id === sessionId);
  const records: AttendanceRecord[] = selected?.attendance ?? [];

  const submit = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      fetch(`/api/sessions/${id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Save failed");
        return d;
      }),
    onSuccess: () => {
      toast({ title: "Attendance saved" });
      setOpen(false);
      setRows([
        { studentName: "", status: "PRESENT" },
        { studentName: "", status: "PRESENT" },
        { studentName: "", status: "PRESENT" },
      ]);
      rq.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function markAttendance() {
    if (sessionId === "none" || !selected) return;
    const clean = rows
      .filter((r) => r.studentName.trim())
      .map((r) => ({ studentName: r.studentName.trim(), status: r.status }));
    if (clean.length === 0) {
      toast({ title: "Nothing to mark", description: "Enter at least one student name.", variant: "destructive" });
      return;
    }
    submit.mutate({ id: selected.id, payload: { records: clean } });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Attendance</CardTitle>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="sm:w-72">
              <SelectValue placeholder="Select a session" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem disabled value="none">Select a session</SelectItem>
              {list.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title} — {format(new Date(s.scheduledAt), "dd MMM, HH:mm")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setOpen(true)}
            disabled={sessionId === "none"}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <UserPlus className="h-4 w-4" />
            Mark attendance
          </Button>
        </div>
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
              title="Could not load sessions"
              description={error instanceof Error ? error.message : "Request failed"}
              action={
                <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : sessionId === "none" ? (
          <div className="p-4">
            <EmptyState icon={ListChecks} title="No session selected" description="Pick a session above to view or mark its attendance." />
          </div>
        ) : records.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={ListChecks} title="No attendance records" description="Attendance has not been marked for this session yet." />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Marked at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.studentName}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(r.markedAt), "dd MMM yyyy, HH:mm")}</TableCell>
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
            <DialogTitle>Mark attendance</DialogTitle>
            <DialogDescription>
              {selected ? `${selected.title} — ${format(new Date(selected.scheduledAt), "EEE, dd MMM · HH:mm")}` : "Select a session first"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-[1fr_130px_auto] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
              <span>Student name</span>
              <span>Status</span>
              <span />
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_130px_auto] items-center gap-2">
                <Input
                  value={row.studentName}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, studentName: e.target.value };
                    setRows(next);
                  }}
                  placeholder={`Student ${idx + 1}`}
                />
                <Select
                  value={row.status}
                  onValueChange={(v) => {
                    const next = [...rows];
                    next[idx] = { ...row, status: v };
                    setRows(next);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                  disabled={rows.length <= 1}
                  onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                  aria-label="Remove row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setRows([...rows, { studentName: "", status: "PRESENT" }])}>
              <Plus className="h-3.5 w-3.5" />
              Add row
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={markAttendance} disabled={submit.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save attendance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AcademicsContent() {
  return (
    <Tabs defaultValue="experiments" className="space-y-4">
      <TabsList>
        <TabsTrigger value="experiments" className="gap-2">
          <FlaskConical className="h-4 w-4" />
          Experiments
        </TabsTrigger>
        <TabsTrigger value="sessions" className="gap-2">
          <CalendarClock className="h-4 w-4" />
          Sessions
        </TabsTrigger>
        <TabsTrigger value="attendance" className="gap-2">
          <ListChecks className="h-4 w-4" />
          Attendance
        </TabsTrigger>
      </TabsList>
      <TabsContent value="experiments">
        <ExperimentsTab />
      </TabsContent>
      <TabsContent value="sessions">
        <SessionsTab />
      </TabsContent>
      <TabsContent value="attendance">
        <AttendanceTab />
      </TabsContent>
    </Tabs>
  );
}

export default function AcademicsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Academics" description="Experiments, lab sessions and student attendance." />
        <AcademicsContent />
      </div>
    </QueryClientProvider>
  );
}
