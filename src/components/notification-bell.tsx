"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch, apiJson } from "@/lib/client";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  read: boolean;
  createdAt: string;
};

type NotificationsResponse = { items: NotificationItem[]; unreadCount: number };

// Left-border tone by notification type (no blue/indigo — sky allowed).
const TYPE_BORDER: Record<string, string> = {
  INFO: "border-l-sky-500 dark:border-l-sky-400",
  WARNING: "border-l-amber-500 dark:border-l-amber-400",
  SUCCESS: "border-l-emerald-500 dark:border-l-emerald-400",
  ERROR: "border-l-red-500 dark:border-l-red-400",
};

function hrefFor(entityType?: string | null, entityId?: string | null): string | null {
  if (!entityType) return null;
  switch (entityType) {
    case "EquipmentItem":
      return entityId ? `/equipment/${entityId}` : "/equipment";
    case "MaintenanceRecord":
      return "/maintenance";
    case "Reservation":
      return "/reservations";
    case "InventoryItem":
      return "/inventory";
    case "PurchaseRequest":
    case "PurchaseOrder":
      return "/procurement";
    case "Incident":
      return "/incidents";
    case "Chemical":
      return "/chemicals";
    case "LabSession":
      return "/academics";
    default:
      return null;
  }
}

export function NotificationBell() {
  // Self-contained provider — the bell lives in the Topbar outside any page's
  // per-page QueryClientProvider (same pattern as the pages themselves).
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationBellInner />
    </QueryClientProvider>
  );
}

function NotificationBellInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const generatedOnce = useRef(false);

  const notifications = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<NotificationsResponse>("/api/notifications"),
    enabled: open,
  });

  // One-time alert generation on first open so the bell has fresh data.
  useEffect(() => {
    if (!open || generatedOnce.current) return;
    generatedOnce.current = true;
    apiFetch("/api/notifications/generate", { method: "POST" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))
      .catch(() => {
        // Silent — generation is best-effort.
      });
  }, [open, queryClient]);

  const markRead = useMutation({
    mutationFn: async (payload: { id?: string; markAllRead?: boolean }) =>
      apiJson("/api/notifications", "PATCH", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  function handleItemClick(item: NotificationItem) {
    if (!item.read) markRead.mutate({ id: item.id });
    const href = hrefFor(item.entityType, item.entityId);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  function handleMarkAllRead() {
    markRead.mutate({ markAllRead: true });
  }

  const unreadCount = notifications.data?.unreadCount ?? 0;
  const items = notifications.data?.items ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white dark:bg-red-500">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleMarkAllRead}
            disabled={markRead.isPending || unreadCount === 0}
            aria-label="Mark all notifications read"
          >
            {markRead.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Mark all read
          </Button>
        </div>
        {notifications.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading notifications...
          </div>
        ) : notifications.isError ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Could not load notifications.
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No notifications yet. Alerts appear here when something needs your attention.
          </div>
        ) : (
          <ScrollArea className="h-80">
            <div className="flex flex-col">
              {items.map((item) => {
                const href = hrefFor(item.entityType, item.entityId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      "relative border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                      TYPE_BORDER[item.type] ?? "border-l-neutral-400 dark:border-l-neutral-600",
                      !item.read && "bg-accent/40"
                    )}
                    aria-label={
                      href ? `${item.title} — open related page` : `${item.title} — mark read`
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {item.title}
                        {!item.read ? (
                          <span
                            className="ml-2 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500 align-middle"
                            aria-label="Unread"
                          />
                        ) : null}
                      </span>
                      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    {item.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
        <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </span>
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Refreshed on open
          </span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
