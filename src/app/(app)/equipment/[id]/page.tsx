"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarClock,
  CircleDot,
  Download,
  FileText,
  FlaskConical,
  History,
  Loader2,
  QrCode,
  Ruler,
  Trash2,
  TriangleAlert,
  Upload,
  Wrench,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { can } from "@/lib/permissions";
import { ApiClientError, apiFetch } from "@/lib/client";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

type LabRef = { id: string; name: string; code: string };

type EquipmentEventRow = {
  id: string;
  type: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  notes?: string | null;
  createdAt: string;
  actor?: { id: string; name: string; email: string } | null;
};

type ReservationRow = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  purpose?: string | null;
  user?: { id: string; name: string } | null;
};

type CheckoutRow = {
  id: string;
  checkedOutAt: string;
  dueAt: string;
  checkedInAt?: string | null;
  status: string;
  conditionOut?: string | null;
  conditionIn?: string | null;
  accessoriesIn?: string | null;
  user?: { id: string; name: string } | null;
};

type MaintenanceRow = {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  scheduledAt: string;
  downtimeHours?: number | null;
  laborCost: number;
  partsCost: number;
  cost: number;
  technician?: { id: string; name: string } | null;
};

type CalibrationRow = {
  id: string;
  standard: string;
  provider?: string | null;
  lastCalibratedAt: string;
  nextDueAt: string;
  certificateNumber?: string | null;
  result: string;
  status: string;
};

type DocumentRow = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy?: { id: string; name: string; email: string } | null;
};

type EquipmentDetail = {
  id: string;
  name: string;
  code: string;
  category: string;
  status: string;
  condition: string;
  serialNumber?: string | null;
  manufacturer?: string | null;
  purchaseDate?: string | null;
  warrantyUntil?: string | null;
  price: number;
  qrToken: string;
  lab?: LabRef | null;
  calibrationRecords?: CalibrationRow[];
  events?: EquipmentEventRow[];
  reservations?: ReservationRow[];
  checkouts?: CheckoutRow[];
  maintenanceRecords?: MaintenanceRow[];
  _count?: { reservations: number; checkouts: number; maintenanceRecords: number; events: number };
  activeCheckoutCount: number;
  activeReservationCount: number;
};

type Me = { session: { userId: string; role: string; name: string } };

function money(n: unknown) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
}

function humanize(s: string) {
  return s.replace(/_/g, " ");
}

function fmt(v?: string | null, pattern: string = "PP") {
  if (!v) return "—";
  try {
    return format(new Date(v), pattern);
  } catch {
    return "—";
  }
}

function rel(v?: string | null) {
  if (!v) return "—";
  try {
    return formatDistanceToNow(new Date(v), { addSuffix: true });
  } catch {
    return "—";
  }
}

function isCheckoutOverdue(row: CheckoutRow) {
  if (row.status !== "ACTIVE" || !row.dueAt) return false;
  try {
    return new Date(row.dueAt).getTime() < Date.now();
  } catch {
    return false;
  }
}

const OPEN_WORK_ORDER_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_PARTS"];

function eventTypeTone(type: string) {
  const t = type.toUpperCase();
  if (["DAMAGED", "RETIRED", "MAINTENANCE_STARTED"].includes(t))
    return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900";
  if (["RESERVED", "CHECKED_OUT", "MAINTENANCE_COMPLETED"].includes(t))
    return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900";
  if (["CREATED", "RETURNED", "CALIBRATION_COMPLETED", "REPAIRED"].includes(t))
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900";
  return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900";
}

export default function EquipmentDetailPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <EquipmentDetailContent />
    </QueryClientProvider>
  );
}

function EquipmentDetailContent() {
  const { id } = useParams<{ id: string }>();

  const me = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => apiFetch<Me>("/api/auth/me"),
    retry: false,
  });

  const equipment = useQuery<EquipmentDetail, ApiClientError>({
    queryKey: ["equipment-detail", id],
    queryFn: () => apiFetch<EquipmentDetail>(`/api/equipment/${id}`),
    enabled: !!id,
    retry: false,
  });

  if (equipment.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-80" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (equipment.isError || !equipment.data) {
    const notFound = equipment.error?.status === 404;
    return (
      <div className="space-y-6">
        <Link
          href="/equipment"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to equipment
        </Link>
        <EmptyState
          icon={Wrench}
          title={notFound ? "Equipment not found" : "Could not load equipment"}
          description={
            notFound
              ? "This equipment may have been removed or you do not have access to it."
              : equipment.error instanceof Error
                ? equipment.error.message
                : "Something went wrong."
          }
          action={
            notFound ? undefined : (
              <Button variant="outline" onClick={() => equipment.refetch()} disabled={equipment.isRefetching}>
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const data = equipment.data;

  return (
    <div className="space-y-6">
      <Link
        href="/equipment"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to equipment
      </Link>

      <PageHeader
        title={data.name}
        description={data.code}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            <StatusBadge status={data.condition} />
            {data.lab ? (
              <Link href={`/labs/${data.lab.id}`}>
                <Badge variant="outline" className="gap-1 bg-muted hover:bg-accent">
                  <FlaskConical className="h-3 w-3" aria-hidden="true" />
                  {data.lab.name}
                </Badge>
              </Link>
            ) : null}
          </div>
        }
      />

      <QuickActions
        equipmentId={data.id}
        qrToken={data.qrToken}
        equipmentName={data.name}
        equipmentCode={data.code}
      />

      <StatRow data={data} />

      <EquipmentTabs data={data} me={me.data ?? null} />
    </div>
  );
}

function QuickActions({
  equipmentId,
  qrToken,
  equipmentName,
  equipmentCode,
}: {
  equipmentId: string;
  qrToken: string;
  equipmentName: string;
  equipmentCode: string;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState("");

  useEffect(() => {
    if (!qrOpen) return;
    const url = `${window.location.origin}/scan/${qrToken}`;
    let cancelled = false;
    QRCode.toDataURL(url)
      .then((u) => {
        if (!cancelled) {
          setScanUrl(url);
          setQrUrl(u);
        }
      })
      .catch(() => {
        if (!cancelled) setQrUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrOpen, qrToken]);

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <Link href={`/reservations?equipment=${equipmentId}&open=1`}>
          <CalendarClock className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Reserve
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href={`/checkouts?equipment=${equipmentId}`}>
          <ArrowLeftRight className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Checkout
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href={`/incidents?equipment=${equipmentId}`}>
          <TriangleAlert className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Report Issue
        </Link>
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          setQrUrl(null);
          setQrOpen(true);
        }}
      >
        <QrCode className="h-4 w-4 mr-1.5" aria-hidden="true" />
        QR Code
      </Button>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Equipment QR code</DialogTitle>
            <DialogDescription>
              Scanning this code opens the equipment page in LabVault.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrUrl ? (
              <img
                alt={`QR code for ${equipmentName}`}
                src={qrUrl}
                className="h-48 w-48 rounded-md border bg-white p-2"
              />
            ) : (
              <Skeleton className="h-48 w-48" />
            )}
            <div className="text-center">
              <div className="font-semibold">{equipmentName}</div>
              <div className="text-sm font-mono text-muted-foreground">{equipmentCode}</div>
              <div className="mt-1 text-xs text-muted-foreground break-all">{scanUrl}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              Print
            </Button>
            <Button asChild variant="outline">
              <Link href={`/equipment/${equipmentId}`}>Open equipment page</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatRow({ data }: { data: EquipmentDetail }) {
  const openWorkOrders = (data.maintenanceRecords ?? []).filter((m) =>
    OPEN_WORK_ORDER_STATUSES.includes(m.status)
  ).length;
  const latestCalibration = (data.calibrationRecords ?? [])[0];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Total reservations"
        value={data._count?.reservations ?? 0}
        icon={CalendarClock}
        hint={`${data.activeReservationCount} upcoming or active`}
      />
      <StatCard
        title="Active checkout"
        value={data.activeCheckoutCount}
        icon={ArrowLeftRight}
        hint={data.activeCheckoutCount > 0 ? "Currently issued" : "None in use"}
      />
      <StatCard
        title="Open work orders"
        value={openWorkOrders}
        icon={Wrench}
        hint={`${data._count?.maintenanceRecords ?? 0} lifetime records`}
      />
      <Card className="py-4">
        <CardContent className="px-4">
          <p className="text-sm font-medium text-muted-foreground">Calibration status</p>
          <div className="mt-2.5 flex items-center gap-2">
            {latestCalibration ? (
              <>
                <StatusBadge status={latestCalibration.status} />
                <span className="text-xs text-muted-foreground">due {fmt(latestCalibration.nextDueAt)}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No calibration records</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EquipmentTabs({ data, me }: { data: EquipmentDetail; me: Me | null }) {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="flex flex-wrap h-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
        <TabsTrigger value="reservations">Reservations</TabsTrigger>
        <TabsTrigger value="checkouts">Checkouts</TabsTrigger>
        <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        <TabsTrigger value="calibration">Calibration</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Specifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Spec label="Category" value={humanize(data.category)} />
              <Spec label="Manufacturer" value={data.manufacturer || "—"} />
              <Spec label="Serial number" value={data.serialNumber || "—"} mono />
              <Spec label="Price" value={money(data.price)} />
              <Spec label="Purchase date" value={fmt(data.purchaseDate)} />
              <Spec label="Warranty until" value={fmt(data.warrantyUntil)} />
              <Spec label="QR token" value={data.qrToken} mono />
              <Spec label="Lab" value={data.lab ? `${data.lab.name} (${data.lab.code})` : "—"} />
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="lifecycle" className="mt-4">
        <LifecycleTimeline events={data.events ?? []} />
      </TabsContent>

      <TabsContent value="reservations" className="mt-4">
        <ReservationsTab rows={data.reservations ?? []} />
      </TabsContent>

      <TabsContent value="checkouts" className="mt-4">
        <CheckoutsTab rows={data.checkouts ?? []} />
      </TabsContent>

      <TabsContent value="maintenance" className="mt-4">
        <MaintenanceTab rows={data.maintenanceRecords ?? []} />
      </TabsContent>

      <TabsContent value="calibration" className="mt-4">
        <CalibrationTab rows={data.calibrationRecords ?? []} />
      </TabsContent>

      <TabsContent value="documents" className="mt-4">
        <DocumentsTab equipmentId={data.id} me={me} />
      </TabsContent>
    </Tabs>
  );
}

function Spec({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-sm break-words", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function LifecycleTimeline({ events }: { events: EquipmentEventRow[] }) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={History}
            title="No lifecycle events"
            description="Status changes, reservations, checkouts and maintenance will be recorded here."
            className="border-none"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Lifecycle ({events.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative ml-3 space-y-6 border-l-2">
          {events.map((event) => (
            <div key={event.id} className="relative pl-6">
              <span className="absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-emerald-600 bg-background dark:border-emerald-400">
                <CircleDot className="h-2 w-2 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    eventTypeTone(event.type)
                  )}
                >
                  {humanize(event.type)}
                </span>
                {event.previousStatus || event.newStatus ? (
                  <span className="text-xs text-muted-foreground">
                    {event.previousStatus ? humanize(event.previousStatus) : "—"}
                    <span className="mx-1" aria-hidden="true">
                      →
                    </span>
                    {event.newStatus ? humanize(event.newStatus) : "—"}
                  </span>
                ) : null}
                <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                  {fmt(event.createdAt, "PPP p")}
                </span>
              </div>
              {event.notes ? <p className="mt-1 text-sm text-muted-foreground">{event.notes}</p> : null}
              <p className="mt-0.5 text-xs text-muted-foreground">by {event.actor?.name ?? "System"}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReservationsTab({ rows }: { rows: ReservationRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={CalendarClock}
            title="No reservations"
            description="Reservation history for this equipment will appear here."
            className="border-none"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested by</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">{row.user?.name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmt(row.startAt, "PPP p")}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmt(row.endAt, "PPP p")}</TableCell>
                  <TableCell className="max-w-52">
                    <span className="text-sm text-muted-foreground line-clamp-2">{row.purpose || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckoutsTab({ rows }: { rows: CheckoutRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={ArrowLeftRight}
            title="No checkouts"
            description="Checkout history for this equipment will appear here."
            className="border-none"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Borrower</TableHead>
                <TableHead>Checked out</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Accessories in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const overdue = isCheckoutOverdue(row) || row.status === "OVERDUE";
                return (
                  <TableRow key={row.id} className={overdue ? "bg-red-50/60 dark:bg-red-950/30" : undefined}>
                    <TableCell className="text-muted-foreground">{row.user?.name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmt(row.checkedOutAt, "PPP p")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span
                        className={
                          overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"
                        }
                      >
                        {fmt(row.dueAt, "PPP p")}
                      </span>
                      {overdue ? <StatusBadge status="OVERDUE" className="ml-2" /> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={overdue && row.status === "ACTIVE" ? "OVERDUE" : row.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {humanize(row.conditionOut || "—")}
                      {row.conditionIn ? (
                        <span className="text-xs text-muted-foreground"> in: {humanize(row.conditionIn)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-40 text-muted-foreground">
                      <span className="line-clamp-2">{row.accessoriesIn || "—"}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function MaintenanceTab({ rows }: { rows: MaintenanceRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={Wrench}
            title="No work orders"
            description="Maintenance work orders for this equipment will appear here."
            className="border-none"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Labor</TableHead>
                <TableHead>Parts</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Downtime</TableHead>
                <TableHead>Technician</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell className="text-muted-foreground">{humanize(row.type)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmt(row.scheduledAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{money(row.laborCost)}</TableCell>
                  <TableCell className="text-muted-foreground">{money(row.partsCost)}</TableCell>
                  <TableCell className="font-medium">{money(row.cost)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.downtimeHours != null ? `${row.downtimeHours} h` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.technician?.name || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CalibrationTab({ rows }: { rows: CalibrationRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={Ruler}
            title="No calibration records"
            description="Calibration history for this equipment will appear here."
            className="border-none"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Standard</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Last calibrated</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Certificate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.standard}</TableCell>
                  <TableCell className="text-muted-foreground">{row.provider || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fmt(row.lastCalibratedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmt(row.nextDueAt)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.result} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.certificateNumber || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentsTab({ equipmentId, me }: { equipmentId: string; me: Me | null }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const documents = useQuery<DocumentRow[]>({
    queryKey: ["documents", "EQUIPMENT", equipmentId],
    queryFn: () => apiFetch<DocumentRow[]>(`/api/documents?entityType=EQUIPMENT&entityId=${equipmentId}`),
    retry: false,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("entityType", "EQUIPMENT");
      form.append("entityId", equipmentId);
      return apiFetch("/api/documents", { method: "POST", body: form });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", "EQUIPMENT", equipmentId] });
      toast({ title: "Document uploaded" });
    },
    onError: (e: Error) =>
      toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
    onSettled: () => {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  const remove = useMutation({
    mutationFn: async (docId: string) => apiFetch(`/api/documents/${docId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", "EQUIPMENT", equipmentId] });
      toast({ title: "Document deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    upload.mutate(file);
  }

  const role = me?.session?.role;
  const myId = me?.session?.userId;
  const rows = documents.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Documents
        </CardTitle>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv"
          onChange={handleFileChange}
          aria-label="Choose document to upload"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          )}
          Upload
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {documents.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : documents.isError ? (
          <div className="p-6">
            <EmptyState
              icon={TriangleAlert}
              title="Could not load documents"
              description={
                documents.error instanceof Error ? documents.error.message : "Something went wrong."
              }
              action={
                <Button
                  variant="outline"
                  onClick={() => documents.refetch()}
                  disabled={documents.isRefetching}
                >
                  Try again
                </Button>
              }
              className="border-none"
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={FileText}
              title="No documents"
              description="Manuals, certificates and reports attached to this equipment will appear here."
              className="border-none"
            />
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((doc) => {
              const canDelete =
                !!myId && (doc.uploadedBy?.id === myId || can(role ?? "", "labs.manage"));
              return (
                <div key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.mimeType} · {(doc.size / 1024).toFixed(0)} KB · {doc.uploadedBy?.name ?? "Unknown"} ·{" "}
                      {rel(doc.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Download ${doc.name}`}
                    >
                      <a href={`/api/documents/${doc.id}/download`} download>
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        aria-label={`Delete ${doc.name}`}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) {
                            remove.mutate(doc.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
