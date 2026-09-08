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
  BookOpen,
  CalendarClock,
  FlaskConical,
  GraduationCap,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiFetch, apiJson } from "@/lib/client";
import { ATTENDANCE_STATUS, EXPERIMENT_STATUS } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type Me = { session: { userId: string; role: string; name: string }; permissions: string[] };
type Lab = { id: string; name: string; code: string };
type Department = { id: string; name: string; code?: string | null };
type UserRow = { id: string; name: string; role: string };
type Course = {
  id: string;
  code: string;
  title: string;
  department?: { id: string; name: string; code?: string | null } | null;
  instructor?: { id: string; name: string; email?: string | null } | null;
  _count?: { experiments: number };
};
type Experiment = {
  id: string;
  title: string;
  code: string;
  description?: string | null;
  status: string;
  lab?: { name: string; code: string } | null;
  course?: { id: string; title: string; code: string } | null;
  instructor?: { name: string } | null;
  _count?: { sessions: number };
};
type LabSession = {
  id: string;
  title: string;
  remarks?: string | null;
  scheduledAt: string;
  durationMin?: number | null;
  room?: string | null;
  status: string;
  experiment?: { title: string } | null;
  lab?: { name: string } | null;
  instructor?: { id: string; name: string } | null;
  attendance?: { id: string; studentName: string; status: string; markedAt: string }[];
};
type AttendanceRecord = { id: string; studentName: string; status: string; markedAt: string };
type Grade = {
  id: string;
  studentName: string;
  score: number;
  maxScore: number;
  remarks?: string | null;
  gradedBy?: { id: string; name: string } | null;
};
type GradeRow = { studentName: string; score: string; maxScore: string; remarks: string };

/* ------------------------------- Courses tab ------------------------------ */

const emptyCourseForm = { code: "", title: "", departmentId: "none", instructorId: "none", description: "" };

function CoursesTab({ canManage }: { canManage: boolean }) {
  const rq = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCourseForm);

  const departments = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => apiFetch<Department[]>("/api/departments"),
  });
  const users = useQuery<UserRow[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserRow[]>("/api/users"),
    retry: false,
  });
  const courses = useQuery<Course[]>({ queryKey: ["courses"], queryFn: () => apiFetch<Course[]>("/api/courses") });

  const instructors = (users.data ?? []).filter((u) => u.role === "INSTRUCTOR" || u.role === "ADMIN" || u.role === "LAB_MANAGER");

  const create = useMutation({
    mutationFn: () =>
      apiJson<Course>("/api/courses", "POST", {
        code: form.code.trim(),
        title: form.title.trim(),
        departmentId: form.departmentId === "none" ? undefined : form.departmentId,
        instructorId: form.instructorId === "none" ? undefined : form.instructorId,
        description: form.description.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Course created" });
      setOpen(false);
      setForm(emptyCourseForm);
      rq.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not create course", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/api/courses/${id}`, "DELETE", {}),
    onSuccess: () => {
      toast({ title: "Course deleted" });
      rq.invalidateQueries({ queryKey: ["courses"] });
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const list = courses.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Courses</CardTitle>
        {canManage ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            New Course
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {courses.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : courses.isError ? (
          <div className="p-4">
            <EmptyState
              icon={TriangleAlert}
              title="Could not load courses"
              description={courses.error instanceof Error ? courses.error.message : "Request failed"}
              action={
                <Button variant="outline" onClick={() => courses.refetch()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BookOpen}
              title="No courses yet"
              description="Create a course to group experiments by curriculum."
            />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Experiments</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs font-medium">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell className="text-muted-foreground">{c.department?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.instructor?.name ?? "—"}</TableCell>
                    <TableCell>{c._count?.experiments ?? 0}</TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(c.id)}
                            aria-label={`Delete course ${c.title}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>Create a course offered by a department.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="course-code">Code</Label>
                <Input
                  id="course-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="CH-301"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="course-title">Title</Label>
                <Input
                  id="course-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Organic Chemistry Lab"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Department</Label>
                <Select value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No department</SelectItem>
                    {(departments.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Instructor</Label>
                <Select value={form.instructorId} onValueChange={(v) => setForm({ ...form, instructorId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select instructor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No instructor yet</SelectItem>
                    {instructors.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="course-desc">Description</Label>
              <Textarea
                id="course-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.code.trim() || !form.title.trim()}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Create course
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ----------------------------- Experiments tab ----------------------------- */

const emptyExpForm = { title: "", code: "", labId: "none", courseId: "none", description: "", status: "DRAFT" };

function ExperimentsTab({ canManage }: { canManage: boolean }) {
  const rq = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyExpForm);

  const labs = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => apiFetch<Lab[]>("/api/labs") });
  const courses = useQuery<Course[]>({ queryKey: ["courses"], queryFn: () => apiFetch<Course[]>("/api/courses") });
  const experiments = useQuery<Experiment[]>({
    queryKey: ["experiments"],
    queryFn: () => apiFetch<Experiment[]>("/api/experiments"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson<Experiment>("/api/experiments", "POST", {
        title: form.title.trim(),
        code: form.code.trim(),
        labId: form.labId,
        courseId: form.courseId === "none" ? undefined : form.courseId,
        description: form.description.trim() || undefined,
        status: form.status,
      }),
    onSuccess: () => {
      toast({ title: "Experiment created" });
      setOpen(false);
      setForm(emptyExpForm);
      rq.invalidateQueries({ queryKey: ["experiments"] });
    },
    onError: (e: Error) =>
      toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiJson(`/api/experiments/${id}`, "DELETE", {}),
    onSuccess: () => {
      toast({ title: "Experiment deleted" });
      rq.invalidateQueries({ queryKey: ["experiments"] });
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const list = experiments.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Experiments</CardTitle>
        {canManage ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            New Experiment
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {experiments.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : experiments.isError ? (
          <div className="p-4">
            <EmptyState
              icon={TriangleAlert}
              title="Could not load experiments"
              description={experiments.error instanceof Error ? experiments.error.message : "Request failed"}
              action={
                <Button variant="outline" onClick={() => experiments.refetch()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FlaskConical}
              title="No experiments yet"
              description="Create your first experiment to start scheduling sessions."
            />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Lab</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-medium">{x.title}</TableCell>
                    <TableCell className="font-mono text-xs">{x.code}</TableCell>
                    <TableCell className="text-muted-foreground">{x.course?.title ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{x.lab?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{x.instructor?.name ?? "—"}</TableCell>
                    <TableCell>{x._count?.sessions ?? 0}</TableCell>
                    <TableCell>
                      <StatusBadge status={x.status} />
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(x.id)}
                            aria-label={`Delete experiment ${x.title}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New experiment</DialogTitle>
            <DialogDescription>Define an experiment that can be run as lab sessions.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="exp-title">Title</Label>
                <Input
                  id="exp-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Titration basics"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="exp-code">Code</Label>
                <Input
                  id="exp-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="EXP-101"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Course</Label>
                <Select value={form.courseId} onValueChange={(v) => setForm({ ...form, courseId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="No course" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No course</SelectItem>
                    {(courses.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Lab</Label>
                <Select value={form.labId} onValueChange={(v) => setForm({ ...form, labId: v })}>
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
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPERIMENT_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="exp-desc">Description</Label>
              <Textarea
                id="exp-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Learning objectives, safety notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !form.title.trim() || !form.code.trim() || form.labId === "none"}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------ Grades dialog ------------------------------ */

function GradesDialog({
  session,
  onClose,
  canGrade,
}: {
  session: LabSession | null;
  onClose: () => void;
  canGrade: boolean;
}) {
  const rq = useQueryClient();
  const [rows, setRows] = useState<GradeRow[]>([{ studentName: "", score: "", maxScore: "100", remarks: "" }]);

  const grades = useQuery<Grade[]>({
    queryKey: ["grades", session?.id],
    queryFn: () => apiFetch<Grade[]>(`/api/sessions/${session?.id}/grades`),
    enabled: !!session,
  });

  useEffect(() => {
    if (!session) return;
    const data = grades.data;
    if (data && data.length > 0) {
      // Defer to a microtask: syncing derived state from a query inside the
      // effect body would trigger a cascading render (react-hooks lint rule).
      queueMicrotask(() =>
        setRows(
          data.map((g) => ({
            studentName: g.studentName,
            score: String(g.score),
            maxScore: String(g.maxScore),
            remarks: g.remarks ?? "",
          }))
        )
      );
    } else if (data && data.length === 0) {
      queueMicrotask(() => setRows([{ studentName: "", score: "", maxScore: "100", remarks: "" }]));
    }
  }, [session, grades.data]);

  const save = useMutation({
    mutationFn: () => {
      const records = rows
        .filter((r) => r.studentName.trim())
        .map((r) => ({
          studentName: r.studentName.trim(),
          score: Number(r.score) || 0,
          maxScore: Number(r.maxScore) || 100,
          remarks: r.remarks.trim() || undefined,
        }));
      return apiJson(`/api/sessions/${session?.id}/grades`, "POST", { records });
    },
    onSuccess: () => {
      toast({ title: "Grades saved" });
      rq.invalidateQueries({ queryKey: ["grades", session?.id] });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit grades</DialogTitle>
          <DialogDescription>
            {session
              ? `${session.title || session.experiment?.title || "Session"} — ${format(new Date(session.scheduledAt), "EEE, dd MMM · HH:mm")}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {grades.isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="grid gap-3 py-2 max-h-80 overflow-y-auto">
            <div className="hidden sm:grid grid-cols-[1fr_90px_90px_1fr_36px] gap-2 px-1 text-xs font-medium text-muted-foreground">
              <span>Student</span>
              <span>Score</span>
              <span>Max</span>
              <span>Remarks</span>
              <span />
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-[1fr_90px_90px_1fr_36px] gap-2">
                <Input
                  value={row.studentName}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, studentName: e.target.value };
                    setRows(next);
                  }}
                  placeholder={`Student ${idx + 1}`}
                  aria-label={`Student ${idx + 1} name`}
                />
                <Input
                  type="number"
                  min="0"
                  value={row.score}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, score: e.target.value };
                    setRows(next);
                  }}
                  aria-label={`Student ${idx + 1} score`}
                />
                <Input
                  type="number"
                  min="1"
                  value={row.maxScore}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, maxScore: e.target.value };
                    setRows(next);
                  }}
                  aria-label={`Student ${idx + 1} max score`}
                />
                <Input
                  value={row.remarks}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, remarks: e.target.value };
                    setRows(next);
                  }}
                  placeholder="Optional"
                  aria-label={`Student ${idx + 1} remarks`}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                  disabled={rows.length <= 1}
                  onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                  aria-label={`Remove grade row ${idx + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setRows([...rows, { studentName: "", score: "", maxScore: "100", remarks: "" }])}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add row
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!canGrade || save.isPending || rows.every((r) => !r.studentName.trim())}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
            Save grades
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Sessions tab ------------------------------- */

const emptySesForm = { experimentId: "none", title: "", labId: "none", scheduledAt: "", durationMin: "90", room: "" };

function SessionsTab({ canManage, onGrade }: { canManage: boolean; onGrade: (s: LabSession) => void }) {
  const rq = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptySesForm);

  const experiments = useQuery<Experiment[]>({
    queryKey: ["experiments"],
    queryFn: () => apiFetch<Experiment[]>("/api/experiments"),
  });
  const labs = useQuery<Lab[]>({ queryKey: ["labs"], queryFn: () => apiFetch<Lab[]>("/api/labs") });
  const sessions = useQuery<LabSession[]>({
    queryKey: ["sessions"],
    queryFn: () => apiFetch<LabSession[]>("/api/sessions"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson<LabSession>("/api/sessions", "POST", {
        experimentId: form.experimentId,
        title: form.title.trim() || undefined,
        labId: form.labId === "none" ? undefined : form.labId,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        durationMin: Number(form.durationMin) || 90,
        room: form.room.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Session scheduled" });
      setOpen(false);
      setForm(emptySesForm);
      rq.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e: Error) =>
      toast({ title: "Schedule failed", description: e.message, variant: "destructive" }),
  });

  const list = sessions.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Lab sessions</CardTitle>
        {canManage ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Schedule Session
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {sessions.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sessions.isError ? (
          <div className="p-4">
            <EmptyState
              icon={TriangleAlert}
              title="Could not load sessions"
              description={sessions.error instanceof Error ? sessions.error.message : "Request failed"}
              action={
                <Button variant="outline" onClick={() => sessions.refetch()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarClock}
              title="No sessions scheduled"
              description="Schedule a session for an experiment to see it here."
            />
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
                  <TableHead>Remarks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.title || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.experiment?.title ?? "—"}</TableCell>
                    <TableCell>
                      {s.lab?.name ?? "—"}
                      {s.room ? <span className="block text-xs text-muted-foreground">{s.room}</span> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(s.scheduledAt), "EEE, dd MMM · HH:mm")}
                    </TableCell>
                    <TableCell>{s.durationMin ? `${s.durationMin} min` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.instructor?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-40">
                      <span className="block truncate text-xs text-muted-foreground" title={s.remarks ?? ""}>
                        {s.remarks ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => onGrade(s)}>
                          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                          Grade
                        </Button>
                      </div>
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
                  <SelectItem disabled value="none">
                    Select experiment
                  </SelectItem>
                  {(experiments.data ?? []).map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.title} ({x.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ses-title">Title</Label>
              <Input
                id="ses-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Session title (optional)"
              />
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
                    {(labs.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ses-room">Room</Label>
                <Input
                  id="ses-room"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder="Room 204"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ses-when">Scheduled at</Label>
                <Input
                  id="ses-when"
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ses-dur">Duration (min)</Label>
                <Input
                  id="ses-dur"
                  type="number"
                  min="15"
                  value={form.durationMin}
                  onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || form.experimentId === "none" || !form.scheduledAt}
            >
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------ Attendance & Grades tab -------------------------- */

function AttendanceGradesTab({
  canManage,
  canGrade,
  onGrade,
}: {
  canManage: boolean;
  canGrade: boolean;
  onGrade: (s: LabSession) => void;
}) {
  const rq = useQueryClient();
  const [sessionId, setSessionId] = useState("none");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ studentName: string; status: string }[]>([
    { studentName: "", status: "PRESENT" },
    { studentName: "", status: "PRESENT" },
    { studentName: "", status: "PRESENT" },
  ]);

  const sessions = useQuery<LabSession[]>({
    queryKey: ["sessions"],
    queryFn: () => apiFetch<LabSession[]>("/api/sessions"),
  });

  const list = sessions.data ?? [];
  const selected = list.find((s) => s.id === sessionId);
  const records: AttendanceRecord[] = selected?.attendance ?? [];
  const grades = useQuery<Grade[]>({
    queryKey: ["grades", sessionId],
    queryFn: () => apiFetch<Grade[]>(`/api/sessions/${sessionId}/grades`),
    enabled: sessionId !== "none",
  });

  const submit = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiJson(`/api/sessions/${id}/attendance`, "POST", payload),
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
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
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
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Attendance</CardTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="sm:w-72" aria-label="Select session">
                <SelectValue placeholder="Select a session" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem disabled value="none">
                  Select a session
                </SelectItem>
                {list.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title || s.experiment?.title || "Session"} — {format(new Date(s.scheduledAt), "dd MMM, HH:mm")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage ? (
              <Button onClick={() => setOpen(true)} disabled={sessionId === "none"}>
                <UserPlus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Mark attendance
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sessions.isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load sessions"
                description={sessions.error instanceof Error ? sessions.error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => sessions.refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : sessionId === "none" ? (
            <div className="p-4">
              <EmptyState
                icon={ListChecks}
                title="No session selected"
                description="Pick a session above to view or mark its attendance."
              />
            </div>
          ) : records.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ListChecks}
                title="No attendance records"
                description="Attendance has not been marked for this session yet."
              />
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
                      <TableCell className="text-muted-foreground">
                        {format(new Date(r.markedAt), "dd MMM yyyy, HH:mm")}
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
              <DialogTitle>Mark attendance</DialogTitle>
              <DialogDescription>
                {selected
                  ? `${selected.title || selected.experiment?.title || "Session"} — ${format(new Date(selected.scheduledAt), "EEE, dd MMM · HH:mm")}`
                  : "Select a session first"}
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
                    aria-label={`Attendance student ${idx + 1} name`}
                  />
                  <Select
                    value={row.status}
                    onValueChange={(v) => {
                      const next = [...rows];
                      next[idx] = { ...row, status: v };
                      setRows(next);
                    }}
                  >
                    <SelectTrigger aria-label={`Attendance student ${idx + 1} status`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTENDANCE_STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                    disabled={rows.length <= 1}
                    onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                    aria-label={`Remove attendance row ${idx + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setRows([...rows, { studentName: "", status: "PRESENT" }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add row
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submit.isPending}>
                Cancel
              </Button>
              <Button onClick={markAttendance} disabled={submit.isPending}>
                {submit.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : null}
                Save attendance
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Grades</CardTitle>
            <CardDescription>Score records for the selected session.</CardDescription>
          </div>
          <Button variant="outline" onClick={() => selected && onGrade(selected)} disabled={!selected || !canGrade}>
            <GraduationCap className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Edit grades
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {sessionId === "none" ? (
            <div className="p-4">
              <EmptyState icon={GraduationCap} title="No session selected" description="Grades for the selected session appear here." />
            </div>
          ) : grades.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : grades.isError ? (
            <div className="p-4">
              <EmptyState
                icon={TriangleAlert}
                title="Could not load grades"
                description={grades.error instanceof Error ? grades.error.message : "Request failed"}
                action={
                  <Button variant="outline" onClick={() => grades.refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : (grades.data ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={GraduationCap}
                title="No grades recorded"
                description="Use Edit grades to record student scores for this session."
              />
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Graded by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(grades.data ?? []).map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.studentName}</TableCell>
                      <TableCell>
                        {g.score} / {g.maxScore}
                      </TableCell>
                      <TableCell>
                        {g.maxScore > 0 ? `${Math.round((g.score / g.maxScore) * 100)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{g.remarks ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{g.gradedBy?.name ?? "—"}</TableCell>
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

/* --------------------------------- Page ----------------------------------- */

function AcademicsContent() {
  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });
  const canManage = (me.data?.permissions ?? []).includes("academics.manage");
  const userId = me.data?.session?.userId;

  const [gradeSession, setGradeSession] = useState<LabSession | null>(null);

  function handleGrade(s: LabSession) {
    if (!canManage && s.instructor?.id !== userId) {
      toast({
        title: "Not allowed",
        description: "Only the session instructor or academics managers can edit grades.",
        variant: "destructive",
      });
      return;
    }
    setGradeSession(s);
  }

  return (
    <>
      <Tabs defaultValue="courses" className="space-y-4">
        <TabsList>
          <TabsTrigger value="courses" className="gap-2">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Courses
          </TabsTrigger>
          <TabsTrigger value="experiments" className="gap-2">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            Experiments
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            Attendance &amp; Grades
          </TabsTrigger>
        </TabsList>
        <TabsContent value="courses">
          <CoursesTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="experiments">
          <ExperimentsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab canManage={canManage} onGrade={handleGrade} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceGradesTab canManage={canManage} canGrade={canManage} onGrade={handleGrade} />
        </TabsContent>
      </Tabs>

      <GradesDialog
        session={gradeSession}
        onClose={() => setGradeSession(null)}
        canGrade={canManage || gradeSession?.instructor?.id === userId}
      />
    </>
  );
}

export default function AcademicsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader
          title="Academics"
          description="Courses, experiments, lab sessions, attendance and grades."
        />
        <AcademicsContent />
      </div>
    </QueryClientProvider>
  );
}
