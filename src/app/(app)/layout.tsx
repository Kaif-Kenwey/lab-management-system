import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const org = await db.organization.findUnique({ where: { id: session.orgId } });
  if (!org) redirect("/login");

  return (
    <AppShell session={{ name: session.name, email: session.email, role: session.role }} orgName={org.name}>
      {children}
    </AppShell>
  );
}
