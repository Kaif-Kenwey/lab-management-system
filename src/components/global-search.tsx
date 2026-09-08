"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Boxes,
  CalendarCheck,
  FlaskConical,
  FlaskRound,
  GraduationCap,
  Hammer,
  Loader2,
  Search,
  TriangleAlert,
  User,
  Wrench,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { apiFetch } from "@/lib/client";

type SearchHit = { id: string; title: string; subtitle: string; href: string };

type SearchResponse = {
  labs: SearchHit[];
  equipment: SearchHit[];
  inventory: SearchHit[];
  reservations: SearchHit[];
  incidents: SearchHit[];
  maintenance: SearchHit[];
  experiments: SearchHit[];
  users: SearchHit[];
};

const EMPTY: SearchResponse = {
  labs: [],
  equipment: [],
  inventory: [],
  reservations: [],
  incidents: [],
  maintenance: [],
  experiments: [],
  users: [],
};

const GROUPS: { key: keyof SearchResponse; heading: string; icon: React.ElementType }[] = [
  { key: "labs", heading: "Labs", icon: FlaskConical },
  { key: "equipment", heading: "Equipment", icon: Wrench },
  { key: "inventory", heading: "Inventory", icon: Boxes },
  { key: "reservations", heading: "Reservations", icon: CalendarCheck },
  { key: "incidents", heading: "Incidents", icon: TriangleAlert },
  { key: "maintenance", heading: "Maintenance", icon: Hammer },
  { key: "experiments", heading: "Experiments", icon: GraduationCap },
  { key: "users", heading: "Users", icon: User },
];

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Self-contained provider — the dialog lives in AppShell outside any page's
  // per-page QueryClientProvider (same pattern as the pages themselves).
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalSearchInner open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
}

function GlobalSearchInner({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setSearch("");
        setDebounced("");
      });
    }
  }, [open]);

  const results = useQuery<SearchResponse>({
    queryKey: ["global-search", debounced],
    queryFn: () => apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length >= 2,
  });

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const data = results.data ?? EMPTY;
  const hasResults = GROUPS.some((g) => (data[g.key] ?? []).length > 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2"
      title="Global search"
      description="Search labs, equipment, inventory, reservations and more"
    >
      <CommandInput
        placeholder="Search labs, equipment, reservations, incidents..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="min-h-72">
        {debounced.length < 2 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search across labs, equipment, inventory,
            reservations, incidents, maintenance, experiments and users.
          </div>
        ) : results.isLoading || results.isFetching ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Searching...
          </div>
        ) : results.isError ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Search failed. Try again in a moment.
          </div>
        ) : !hasResults ? (
          <CommandEmpty>No results found.</CommandEmpty>
        ) : (
          GROUPS.map((group) => {
            const hits = data[group.key] ?? [];
            if (hits.length === 0) return null;
            const Icon = group.icon;
            return (
              <CommandGroup key={group.key} heading={group.heading}>
                {hits.map((hit) => (
                  <CommandItem
                    key={`${group.key}-${hit.id}`}
                    value={`${hit.title} ${hit.subtitle}`}
                    onSelect={() => go(hit.href)}
                    className="cursor-pointer"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{hit.title}</div>
                      {hit.subtitle ? (
                        <div className="truncate text-xs text-muted-foreground">{hit.subtitle}</div>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })
        )}
      </CommandList>
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FlaskRound className="h-3.5 w-3.5" aria-hidden="true" />
          LabVault global search
        </span>
        <span>Enter to open · Esc to close</span>
      </div>
    </CommandDialog>
  );
}

export function SearchTriggerButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open search"
      className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="hidden lg:inline">Search...</span>
      <kbd className="pointer-events-none hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
        Ctrl K
      </kbd>
    </button>
  );
}
