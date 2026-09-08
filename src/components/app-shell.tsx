"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { GlobalSearch } from "@/components/global-search";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({
  children,
  session,
  orgName,
}: {
  children: React.ReactNode;
  session: { name: string; email: string; role: string };
  orgName: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  // Reached the authenticated shell — the session cookie works, so clear any
  // pending login-bounce flag used by the login page's cookie-block detector.
  useEffect(() => {
    sessionStorage.removeItem("lms_login_bounce");
  }, []);

  // Global search: Cmd/Ctrl+K anywhere inside the shell.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar role={session.role} orgName={orgName} />
      <SidebarInset className="min-h-screen flex flex-col">
        <Topbar
          name={session.name}
          email={session.email}
          role={session.role}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6 w-full max-w-full overflow-x-hidden">{children}</main>
      </SidebarInset>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  );
}
