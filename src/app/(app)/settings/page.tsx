"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { UserRound, Building2, SunMoon, TriangleAlert, BadgeCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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

type MeResponse = {
  session: {
    userId: string;
    orgId: string;
    orgSlug: string;
    role: string;
    email: string;
    name: string;
    orgName?: string;
    plan?: string;
  };
};

function SettingsContent() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: () => fetcher("/api/auth/me"),
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !data?.session) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load settings"
        description={error instanceof Error ? error.message : "Request failed"}
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

  const session = data.session;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserRound className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Profile
            </CardTitle>
            <CardDescription>Your account details. Contact an admin to change them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="mt-1 text-sm font-medium">{session.name}</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="mt-1 text-sm font-medium">{session.email}</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium">
                <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                {session.role.replace(/_/g, " ")}
              </p>
            </div>
            <Separator />
            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
              <SunMoon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Theme is set per device. Toggle between light and dark mode at any time from the moon / sun button in the top bar.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Organization
            </CardTitle>
            <CardDescription>Workspace details. Only administrators can change organization settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="mt-1 text-sm font-medium">{session.orgName ?? session.orgSlug}</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Slug</p>
              <p className="mt-1 font-mono text-sm font-medium">{session.orgSlug}</p>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan</p>
              <p className="mt-1 text-sm font-medium">{session.plan ?? "Standard (managed by your plan administrator)"}</p>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              All data in this workspace is scoped to your organization. Members can only see labs, equipment and records that belong to it.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
            <TriangleAlert className="h-4 w-4" />
            Danger zone
          </CardTitle>
          <CardDescription>Irreversible actions — proceed with caution.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Deleting the organization permanently removes all labs, equipment, inventory, chemicals, reservations, sessions and audit history.
            This action is restricted to administrators and is performed from the server by the platform owner. If you need your workspace
            reset or deleted, contact support with your organization slug <span className="font-mono text-foreground">{session.orgSlug}</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <div className="space-y-6">
        <PageHeader title="Settings" description="Your profile and organization details." />
        <SettingsContent />
      </div>
    </QueryClientProvider>
  );
}
