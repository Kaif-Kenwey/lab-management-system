"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarCheck,
  Download,
  Gauge,
  TimerReset,
  TriangleAlert,
} from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";

type Me = { session: { userId: string; role: string; name: string }; permissions: string[] };

type ReportData = {
  period: string;
  windowStart: string;
  equipmentUtilization: { name: string; hours: number }[];
  maintenanceCostByMonth: { label: string; labor: number; parts: number }[];
  inventoryConsumption: { label: string; issued: number }[];
  incidentsBySeverity: { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number };
  calibrationCompliance: {
    total: number;
    valid: number;
    dueSoon: number;
    overdue: number;
    failed: number;
    compliancePct: number;
  };
  stockOutRate: number;
  reservationFulfillment: { completed: number; cancelled: number; noShow: number; fulfillmentPct: number };
  downtimeHoursByEquipment: { name: string; hours: number }[];
};

const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const TEAL = "#14b8a6";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: EMERALD,
  MEDIUM: AMBER,
  HIGH: RED,
  CRITICAL: "#b91c1c",
};

function ReportsContent() {
  const [period, setPeriod] = useState("monthly");

  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });
  const canExport = (me.data?.permissions ?? []).includes("reports.export");

  const report = useQuery<ReportData>({
    queryKey: ["reports", period],
    queryFn: () => apiFetch<ReportData>(`/api/reports?period=${period}`),
    placeholderData: (prev) => prev,
  });

  const data = report.data;

  const downtimeTotal = (data?.downtimeHoursByEquipment ?? []).reduce((sum, d) => sum + d.hours, 0);

  const incidentPie = data
    ? [
        { name: "Low", value: data.incidentsBySeverity.LOW },
        { name: "Medium", value: data.incidentsBySeverity.MEDIUM },
        { name: "High", value: data.incidentsBySeverity.HIGH },
        { name: "Critical", value: data.incidentsBySeverity.CRITICAL },
      ].filter((d) => d.value > 0)
    : [];

  function exportCsv() {
    if (!data) return;
    const rows = [["Equipment", "Utilization hours"]];
    for (const r of data.equipmentUtilization) {
      rows.push([r.name, String(r.hours)]);
    }
    const csv = rows
      .map((r) => r.map((cell) => (cell.includes(",") || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `equipment-utilization-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `equipment-utilization-${period}.csv downloaded.` });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Operational KPIs computed from live data for the selected period."
        actions={
          canExport ? (
            <Button variant="outline" onClick={exportCsv} disabled={!data}>
              <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Export CSV
            </Button>
          ) : null
        }
      />

      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
        </TabsList>
      </Tabs>

      {report.isLoading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        </div>
      ) : report.isError && !data ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load reports"
          description={report.error instanceof Error ? report.error.message : "Something went wrong while fetching report data."}
          action={
            <Button variant="outline" onClick={() => report.refetch()}>
              Try again
            </Button>
          }
        />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Calibration compliance"
              value={`${data.calibrationCompliance.compliancePct}%`}
              icon={Gauge}
              hint={`${data.calibrationCompliance.valid}/${data.calibrationCompliance.total} valid`}
            />
            <StatCard
              title="Stock-out rate"
              value={`${data.stockOutRate}%`}
              icon={Activity}
              hint="Items with zero stock on hand"
            />
            <StatCard
              title="Reservation fulfillment"
              value={`${data.reservationFulfillment.fulfillmentPct}%`}
              icon={CalendarCheck}
              hint={`${data.reservationFulfillment.completed} completed`}
            />
            <StatCard
              title="Total downtime"
              value={`${Math.round(downtimeTotal * 10) / 10} h`}
              icon={TimerReset}
              hint="Completed work orders, last 90 days"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Equipment utilization</CardTitle>
                <CardDescription>Reserved hours in the selected period, top 8</CardDescription>
              </CardHeader>
              <CardContent>
                {data.equipmentUtilization.length === 0 ? (
                  <EmptyState icon={Gauge} title="No reservations" description="No utilization recorded for this period." />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.equipmentUtilization} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
                          stroke="currentColor"
                          className="text-muted-foreground"
                        />
                        <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                        <Tooltip cursor={{ fill: "rgba(16,185,129,0.08)" }} />
                        <Bar dataKey="hours" name="Hours" fill={EMERALD} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Maintenance cost by month</CardTitle>
                <CardDescription>Labor vs parts spend, last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.maintenanceCostByMonth} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="currentColor"
                        className="text-muted-foreground"
                        tickFormatter={(v: number) => `₹${v}`}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(20,184,166,0.08)" }}
                        formatter={(value: number | string) => `₹${Number(value).toLocaleString("en-IN")}`}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="labor" name="Labor" stackId="cost" fill={TEAL} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="parts" name="Parts" stackId="cost" fill={AMBER} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inventory consumption</CardTitle>
                <CardDescription>Issued quantities per month bucket</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.inventoryConsumption} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="issueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={EMERALD} stopOpacity={0.5} />
                          <stop offset="95%" stopColor={EMERALD} stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="issued"
                        name="Issued"
                        stroke={EMERALD}
                        strokeWidth={2}
                        fill="url(#issueGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Incidents by severity</CardTitle>
                <CardDescription>Reported incidents within the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                {incidentPie.length === 0 ? (
                  <EmptyState icon={TriangleAlert} title="No incidents" description="Nothing was reported in this period." />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={incidentPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                          {incidentPie.map((entry) => (
                            <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] ?? EMERALD} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Downtime hours by equipment</CardTitle>
                <CardDescription>Completed work orders over the last 90 days, top 8</CardDescription>
              </CardHeader>
              <CardContent>
                {data.downtimeHoursByEquipment.length === 0 ? (
                  <EmptyState icon={TimerReset} title="No downtime" description="No completed work orders recorded downtime." />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.downtimeHoursByEquipment} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
                          stroke="currentColor"
                          className="text-muted-foreground"
                        />
                        <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                        <Tooltip cursor={{ fill: "rgba(239,68,68,0.08)" }} />
                        <Bar dataKey="hours" name="Downtime hours" fill={RED} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ReportsContent />
    </QueryClientProvider>
  );
}
