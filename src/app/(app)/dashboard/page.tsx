"use client";

import { useState } from "react";
import Link from "next/link";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Hammer,
  History,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
  Timer,
  TriangleAlert,
  UserPlus,
  Wrench,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { apiFetch } from "@/lib/client";
import { cn } from "@/lib/utils";

// Emerald palette for the charts (no blue/indigo).
const PALETTE = ["#10b981", "#059669", "#34d399", "#047857", "#6ee7b7", "#a7f3d0", "#065f46"];

type AttentionItem = {
  key: string;
  label: string;
  count: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  href: string;
};

type AttentionData = { items: AttentionItem[]; generatedAt: string };

type DashboardData = {
  byCategory: { category: string; count: number }[];
  utilization: { name: string; value: number }[];
  upcoming: {
    id: string;
    title: string;
    scheduledAt: string;
    room?: string | null;
    status: string;
    experiment?: { title: string } | null;
  }[];
  recentAudit: {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    user?: { name: string } | null;
  }[];
};

type ReservationRow = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  equipment?: { name?: string; code?: string } | null;
  user?: { id?: string; name?: string } | null;
};

const SEVERITY_BORDER: Record<string, string> = {
  CRITICAL: "border-l-red-500 dark:border-l-red-400",
  HIGH: "border-l-amber-500 dark:border-l-amber-400",
  MEDIUM: "border-l-sky-500 dark:border-l-sky-400",
  LOW: "border-l-neutral-400 dark:border-l-neutral-600",
};

const SEVERITY_TEXT: Record<string, string> = {
  CRITICAL: "text-red-600 dark:text-red-400",
  HIGH: "text-amber-600 dark:text-amber-400",
  MEDIUM: "text-sky-600 dark:text-sky-400",
  LOW: "text-neutral-600 dark:text-neutral-400",
};

function humanize(s: string) {
  return s.replace(/_/g, " ").toLowerCase();
}

function retryButton(onClick: () => void, disabled: boolean) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
    >
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
      Try again
    </button>
  );
}

export default function DashboardPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <OperationsHeader />
        <AttentionSection />
        <TodaySection />
        <ChartsSection />
        <ActivitySection />
      </div>
    </QueryClientProvider>
  );
}

function OperationsHeader() {
  const attention = useQuery<AttentionData>({
    queryKey: ["attention"],
    queryFn: () => apiFetch<AttentionData>("/api/operations/attention"),
  });

  let generatedAt: string | null = null;
  if (attention.data?.generatedAt) {
    try {
      generatedAt = format(new Date(attention.data.generatedAt), "PPP p");
    } catch {
      generatedAt = null;
    }
  }

  return (
    <PageHeader
      title="Operations Center"
      description="What needs attention right now?"
      actions={
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {attention.isLoading
            ? "Loading status..."
            : generatedAt
              ? `Updated ${generatedAt}`
              : null}
        </span>
      }
    />
  );
}

function AttentionSection() {
  const attention = useQuery<AttentionData>({
    queryKey: ["attention"],
    queryFn: () => apiFetch<AttentionData>("/api/operations/attention"),
  });

  if (attention.isLoading) {
    return (
      <section aria-label="Attention required" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Attention required
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (attention.isError || !attention.data) {
    return (
      <section aria-label="Attention required" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Attention required
        </h2>
        <EmptyState
          icon={TriangleAlert}
          title="Could not load attention items"
          description={
            attention.error instanceof Error
              ? attention.error.message
              : "Something went wrong while checking what needs attention."
          }
          action={retryButton(() => attention.refetch(), attention.isRefetching)}
        />
      </section>
    );
  }

  const items = attention.data.items ?? [];

  if (items.length === 0) {
    return (
      <section aria-label="Attention required" className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Attention required
        </h2>
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 !text-emerald-600 dark:!text-emerald-400" />
          <AlertTitle>All clear</AlertTitle>
          <AlertDescription>
            No overdue checkouts, low stock, overdue calibrations, open critical incidents or pending
            approvals right now.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section aria-label="Attention required" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Attention required
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Link key={item.key} href={item.href} className="group block focus-visible:outline-none">
            <Card
              className={cn(
                "h-full border-l-4 py-4 transition-colors group-hover:border-l-[currentColor] group-hover:bg-accent/40",
                SEVERITY_BORDER[item.severity] ?? SEVERITY_BORDER.LOW,
                "hover:bg-accent/40"
              )}
            >
              <CardContent className="px-4">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn(
                      "text-3xl font-bold tracking-tight tabular-nums",
                      SEVERITY_TEXT[item.severity] ?? SEVERITY_TEXT.LOW
                    )}
                  >
                    {item.count}
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      SEVERITY_TEXT[item.severity] ?? SEVERITY_TEXT.LOW
                    )}
                  >
                    {item.severity}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{item.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TodaySection() {
  const dashboard = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/dashboard"),
  });

  const pending = useQuery<ReservationRow[]>({
    queryKey: ["reservations", { status: "PENDING" }],
    queryFn: () => apiFetch<ReservationRow[]>("/api/reservations?status=PENDING"),
  });

  const upcoming = dashboard.data?.upcoming ?? [];
  const approvals = (pending.data ?? []).slice(0, 4);

  return (
    <section aria-label="Today" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Upcoming sessions
            </CardTitle>
            <CardDescription>Next scheduled lab sessions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : dashboard.isError ? (
              <EmptyState
                icon={TriangleAlert}
                title="Could not load sessions"
                description={dashboard.error instanceof Error ? dashboard.error.message : "Something went wrong"}
                action={retryButton(() => dashboard.refetch(), dashboard.isRefetching)}
                className="py-8"
              />
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={FlaskConical}
                title="No upcoming sessions"
                description="Scheduled lab sessions will appear here."
                className="py-8"
              />
            ) : (
              upcoming.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.experiment?.title ?? "General session"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(new Date(s.scheduledAt), "EEE, dd MMM · HH:mm")}
                      {s.room ? ` · ${s.room}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              Pending approvals
            </CardTitle>
            <CardDescription>
              Reservation requests waiting for a decision
              {pending.data && pending.data.length > approvals.length
                ? ` · ${pending.data.length} total`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : pending.isError ? (
              <EmptyState
                icon={TriangleAlert}
                title="Could not load approvals"
                description={pending.error instanceof Error ? pending.error.message : "Something went wrong"}
                action={retryButton(() => pending.refetch(), pending.isRefetching)}
                className="py-8"
              />
            ) : approvals.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing waiting on approval"
                description="New reservation requests will appear here."
                className="py-8"
              />
            ) : (
              <>
                {approvals.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.equipment?.name || "Equipment"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.user?.name ?? "Unknown requester"} · starts{" "}
                        {formatDistanceToNow(new Date(r.startAt), { addSuffix: true })}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
                <Link
                  href="/reservations?status=PENDING"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  <Timer className="h-4 w-4" aria-hidden="true" />
                  Review all pending approvals
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ChartsSection() {
  const dashboard = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/dashboard"),
  });

  const byCategory = dashboard.data?.byCategory ?? [];
  const utilization = dashboard.data?.utilization ?? [];

  return (
    <section aria-label="Distribution" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Distribution
      </h2>
      {dashboard.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : dashboard.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load charts"
          description={dashboard.error instanceof Error ? dashboard.error.message : "Something went wrong"}
          action={retryButton(() => dashboard.refetch(), dashboard.isRefetching)}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Equipment by category</CardTitle>
              <CardDescription>Count of equipment items in each category</CardDescription>
            </CardHeader>
            <CardContent>
              {byCategory.length === 0 ? (
                <EmptyState
                  icon={Boxes}
                  title="No equipment yet"
                  description="Add equipment to see the category breakdown."
                  className="border-none py-8"
                />
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <BarChart data={byCategory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="currentColor"
                      className="text-border"
                    />
                    <XAxis
                      dataKey="category"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.replace(/_/g, " ").toLowerCase()}
                      stroke="currentColor"
                      className="text-muted-foreground"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                    />
                    <Tooltip cursor={{ fill: "rgba(16,185,129,0.08)" }} />
                    <Bar dataKey="count" name="Equipment" radius={[6, 6, 0, 0]} fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Equipment per lab</CardTitle>
              <CardDescription>Labs by equipment count</CardDescription>
            </CardHeader>
            <CardContent>
              {utilization.length === 0 ? (
                <EmptyState
                  icon={FlaskConical}
                  title="No labs yet"
                  description="Create labs and add equipment to see distribution."
                  className="border-none py-8"
                />
              ) : (
                <ResponsiveContainer width="100%" height={224}>
                  <PieChart>
                    <Pie
                      data={utilization}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {utilization.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}

function activityIcon(action: string) {
  const a = action.toUpperCase();
  if (a.startsWith("EQUIPMENT")) return Wrench;
  if (a.startsWith("RESERVATION")) return CalendarClock;
  if (a.startsWith("CHECKOUT")) return ArrowLeftRight;
  if (a.startsWith("INVENTORY")) return Boxes;
  if (a.startsWith("MAINTENANCE")) return Hammer;
  if (a.startsWith("INCIDENT")) return ShieldAlert;
  if (a.startsWith("USER")) return UserPlus;
  if (a.startsWith("PURCHASE") || a.startsWith("ORDER") || a.startsWith("PO")) return PackageOpen;
  return History;
}

function ActivitySection() {
  const dashboard = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/dashboard"),
  });

  const recentAudit = dashboard.data?.recentAudit ?? [];

  return (
    <section aria-label="Recent activity" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Recent activity
      </h2>
      {dashboard.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : dashboard.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load activity"
          description={dashboard.error instanceof Error ? dashboard.error.message : "Something went wrong"}
          action={retryButton(() => dashboard.refetch(), dashboard.isRefetching)}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            {recentAudit.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={History}
                  title="No activity yet"
                  description="Recent actions across the organization will appear here."
                  className="border-none"
                />
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <div className="divide-y">
                  {recentAudit.map((a) => {
                    const Icon = activityIcon(a.action);
                    return (
                      <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                        <div className="rounded-md bg-muted p-1.5">
                          <Icon
                            className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            <span className="font-medium">{a.user?.name ?? "System"}</span>{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              {a.action.toLowerCase()}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              on {a.entityType.toLowerCase()}
                            </span>
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
