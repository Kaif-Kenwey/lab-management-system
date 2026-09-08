"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Lock, Search, ScrollText, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.error === "string" ? d.error : d?.error?.message || "Request failed");
  }
  return res.json();
}

type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: string | null;
  createdAt: string;
  user?: { name: string; email: string } | null;
};

function AuditContent() {
  const [q, setQ] = useState("");

  const prettyMetadata = (raw?: string | null) => {
    if (!raw) return null;
    try {
      return JSON.stringify(JSON.parse(raw), null, 0).replace(/^\{|\}$/g, "");
    } catch {
      return raw;
    }
  };

  const { data: me, isLoading: meLoading } = useQuery<{ session: { role: string } }>({
    queryKey: ["me"],
    queryFn: () => fetcher("/api/auth/me"),
  });
  const role = me?.session?.role;
  const allowed = role === "ADMIN" || role === "LAB_MANAGER";

  const { data: logs, isLoading, isError, error, refetch, isRefetching } = useQuery<AuditEntry[]>({
    queryKey: ["audit", q],
    queryFn: () => fetcher(`/api/audit${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    enabled: allowed,
  });

  if (meLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  if (!allowed) {
    return (
      <EmptyState
        icon={Lock}
        title="Restricted access"
        description="Requires Admin or Lab Manager role. Ask your administrator for access to the audit log."
      />
    );
  }

  const list = logs ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Audit log</CardTitle>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, entity, user..." className="pl-8 sm:w-72" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-4">
            <EmptyState
              icon={TriangleAlert}
              title="Could not load audit log"
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
            <EmptyState icon={ScrollText} title="No audit entries" description="Actions across the organization will be recorded here." />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity type</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Metadata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(entry.createdAt), "PPP p")}
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm font-medium leading-tight">{entry.user?.name ?? "System"}</span>
                      <span className="block text-xs text-muted-foreground leading-tight">{entry.user?.email ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-block rounded bg-muted px-2 py-0.5 font-mono text-xs">{entry.action}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.entityType}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="block max-w-24 truncate" title={entry.entityId ?? undefined}>
                        {entry.entityId ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="block truncate text-xs text-muted-foreground" title={entry.metadata ?? undefined}>
                        {prettyMetadata(entry.metadata) ?? "—"}
                      </span>
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

export default function AuditPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Audit Log" description="Immutable record of actions performed across your organization." />
        <AuditContent />
      </div>
    </QueryClientProvider>
  );
}
