"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
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
  return (
    <SidebarProvider>
      <AppSidebar role={session.role} orgName={orgName} />
      <SidebarInset className="min-h-screen flex flex-col">
        <Topbar name={session.name} email={session.email} role={session.role} />
        <main className="flex-1 p-4 md:p-6 w-full max-w-full overflow-x-hidden">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
