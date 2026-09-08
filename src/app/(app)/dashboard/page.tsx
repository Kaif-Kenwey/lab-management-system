"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Building2,
  Boxes,
  ClipboardList,
  CalendarClock,
  TriangleAlert,
  PackageOpen,
  FlaskConical,
  History,
  Activity,
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
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

const PALETTE = ["#10b981", "#f59e0b", "#ef4444", "#14b8a6", "#a855f7", "#64748b"];

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Request failed");
  }
  return res.json();
}

type DashboardData = {
  stats: {
    labs: number;
    equipment: number;
    availableEquipment: number;
    underMaintenance: number;
    activeCheckouts: number;
    overdueCheckouts: number;
    pendingReservations: number;
    lowStockItems: number;
    openIncidents: number;
    members: number;
  };
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

function DashboardContent() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetcher("/api/dashboard"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load dashboard"
        description={error instanceof Error ? error.message : "Something went wrong while fetching dashboard data."}
        action={
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            disabled={isRefetching}
          >
            <Activity className="h-4 w-4" />
            Try again
          </button>
        }
      />
    );
  }

  const { stats, byCategory, utilization, upcoming, recentAudit } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Labs" value={stats.labs} icon={Building2} />
        <StatCard title="Equipment Available" value={stats.availableEquipment} icon={Boxes} hint={`${stats.equipment} total`} />
        <StatCard title="Active Checkouts" value={stats.activeCheckouts} icon={ClipboardList} hint={stats.overdueCheckouts > 0 ? `${stats.overdueCheckouts} overdue` : "None overdue"} />
        <StatCard title="Pending Reservations" value={stats.pendingReservations} icon={CalendarClock} />
      </div>

      {stats.overdueCheckouts > 0 ? (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <TriangleAlert className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
          <AlertTitle>Overdue equipment checkouts</AlertTitle>
          <AlertDescription>
            {stats.overdueCheckouts} checked-out item{stats.overdueCheckouts === 1 ? " is" : "s are"} past its due date. Follow up with the borrowers to have them returned.
          </AlertDescription>
        </Alert>
      ) : null}

      {stats.lowStockItems > 0 ? (
        <Alert className="border-amber-200 bg-amber-50/50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <PackageOpen className="h-4 w-4 !text-amber-600 dark:!text-amber-400" />
          <AlertTitle>Low stock items</AlertTitle>
          <AlertDescription>
            {stats.lowStockItems} inventory item{stats.lowStockItems === 1 ? "" : "s"} have reached or fallen below their minimum quantity. Consider raising purchase requests.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipment by category</CardTitle>
            <CardDescription>Count of equipment items in each category</CardDescription>
          </CardHeader>
          <CardContent>
            {byCategory.length === 0 ? (
              <EmptyState icon={Boxes} title="No equipment yet" description="Add equipment to see the category breakdown." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byCategory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.replace(/_/g, " ").toLowerCase()}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                  <Tooltip cursor={{ fill: "rgba(16,185,129,0.08)" }} />
                  <Bar dataKey="count" name="Equipment" radius={[6, 6, 0, 0]}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipment per lab</CardTitle>
            <CardDescription>Top 5 labs by equipment count</CardDescription>
          </CardHeader>
          <CardContent>
            {utilization.length === 0 ? (
              <EmptyState icon={Building2} title="No labs yet" description="Create labs and add equipment to see distribution." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={utilization} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Upcoming sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 ? (
              <EmptyState icon={FlaskConical} title="No upcoming sessions" description="Scheduled lab sessions will appear here." />
            ) : (
              upcoming.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.experiment?.title ?? "General session"}</p>
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
              <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAudit.length === 0 ? (
              <EmptyState icon={History} title="No activity yet" description="Recent actions across the organization will appear here." />
            ) : (
              recentAudit.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.user?.name ?? "System"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{a.action.toLowerCase()}</span> on {a.entityType.toLowerCase()}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Overview of labs, equipment, and activity across your organization." />
        <DashboardContent />
      </div>
    </QueryClientProvider>
  );
}
