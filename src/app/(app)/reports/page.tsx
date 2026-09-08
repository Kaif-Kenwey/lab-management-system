"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Building2, Boxes, Users, ShieldAlert, FileText, TriangleAlert } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
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
};

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  minQuantity?: number | null;
  lab?: { name: string } | null;
};

function ReportsContent() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetcher("/api/dashboard"),
  });

  const { data: lowStockItems, isLoading: lowLoading } = useQuery<InventoryItem[]>({
    queryKey: ["inventory", "lowStock"],
    queryFn: () => fetcher("/api/inventory?lowStock=true"),
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
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load reports"
        description={error instanceof Error ? error.message : "Something went wrong while fetching report data."}
        action={
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            disabled={isRefetching}
          >
            Try again
          </button>
        }
      />
    );
  }

  const { stats, byCategory, utilization } = data;

  // Group low stock items by lab name for the inventory health chart
  const byLab = new Map<string, number>();
  for (const item of lowStockItems ?? []) {
    const key = item.lab?.name ?? "Unassigned";
    byLab.set(key, (byLab.get(key) ?? 0) + 1);
  }
  const lowStockByLab = Array.from(byLab.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const topLab = utilization.length > 0 ? utilization.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const topCategory = byCategory.length > 0 ? byCategory.reduce((a, b) => (b.count > a.count ? b : a)) : null;
  const totalEquipment = byCategory.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Labs" value={stats.labs} icon={Building2} />
        <StatCard title="Equipment" value={stats.equipment} icon={Boxes} hint={`${stats.availableEquipment} available`} />
        <StatCard title="Members" value={stats.members} icon={Users} />
        <StatCard title="Open incidents" value={stats.openIncidents} icon={ShieldAlert} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipment by category</CardTitle>
            <CardDescription>Distribution across {byCategory.length} categories</CardDescription>
          </CardHeader>
          <CardContent>
            {byCategory.length === 0 ? (
              <EmptyState icon={Boxes} title="No data" description="Add equipment to generate this report." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={byCategory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="catGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.replace(/_/g, " ").toLowerCase()}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" name="Equipment" stroke="#10b981" strokeWidth={2} fill="url(#catGrad)" />
                </AreaChart>
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
              <EmptyState icon={Building2} title="No data" description="Add labs and equipment to generate this report." />
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
            <CardTitle className="text-base">Inventory health</CardTitle>
            <CardDescription>
              Labs with items at or below minimum quantity
              {lowLoading ? <Skeleton className="ml-2 inline-block h-4 w-20 align-middle" /> : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!lowLoading && lowStockByLab.length === 0 ? (
              <EmptyState icon={FileText} title="All stocked" description="No lab has items below minimum quantity." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={lowStockByLab} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-border" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                  <Tooltip cursor={{ fill: "rgba(245,158,11,0.08)" }} />
                  <Bar dataKey="count" name="Low stock items" fill="#f59e0b" radius={[0, 6, 6, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
            <CardDescription>Generated overview of your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Your organization operates <span className="font-semibold text-foreground">{stats.labs} labs</span> housing{" "}
              <span className="font-semibold text-foreground">{stats.equipment} equipment items</span>, of which{" "}
              <span className="font-semibold text-foreground">{stats.availableEquipment} are currently available</span> and{" "}
              <span className="font-semibold text-foreground">{stats.underMaintenance} are under maintenance</span>.
            </p>
            <p>
              {topCategory ? (
                <>
                  The largest equipment category is <span className="font-semibold text-foreground">{topCategory.category.replace(/_/g, " ").toLowerCase()}</span> with{" "}
                  <span className="font-semibold text-foreground">{topCategory.count} items</span>
                  {topLab ? (
                    <>
                      , while <span className="font-semibold text-foreground">{topLab.name}</span> is the best-equipped lab with{" "}
                      <span className="font-semibold text-foreground">{topLab.value} items</span>.
                    </>
                  ) : (
                    "."
                  )}
                </>
              ) : (
                "No equipment has been registered yet."
              )}
            </p>
            <p>
              <span className="font-semibold text-foreground">{stats.members} members</span> collaborate across the organization. There are{" "}
              <span className="font-semibold text-foreground">{stats.activeCheckouts} active checkouts</span> ({" "}
              <span className="font-semibold text-amber-600 dark:text-amber-400">{stats.overdueCheckouts} overdue</span>),{" "}
              <span className="font-semibold text-foreground">{stats.pendingReservations} pending reservations</span> and{" "}
              <span className="font-semibold text-foreground">{stats.openIncidents} open incidents</span> to review.
            </p>
            <p>
              Inventory health:{" "}
              <span className="font-semibold text-foreground">{stats.lowStockItems} items</span> have reached their minimum quantity across{" "}
              <span className="font-semibold text-foreground">{lowStockByLab.length} labs</span>
              {stats.lowStockItems > 0 ? " — raise purchase requests to restock before shortages occur." : " — no action needed."}
            </p>
            {totalEquipment > 0 ? (
              <p className="text-xs text-muted-foreground/80">
                Report covers {totalEquipment} equipment items across {byCategory.length} categories and {utilization.length} labs.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Reports" description="Analytics and summaries across labs, equipment and inventory." />
        <ReportsContent />
      </div>
    </QueryClientProvider>
  );
}
