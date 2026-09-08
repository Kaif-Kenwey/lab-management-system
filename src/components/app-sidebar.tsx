"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FlaskConical,
  Wrench,
  CalendarCheck,
  ArrowLeftRight,
  Boxes,
  FlaskRound,
  Hammer,
  GraduationCap,
  AlertTriangle,
  ShoppingCart,
  BarChart3,
  ScrollText,
  Settings,
  FlaskConical as Logo,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Role } from "@/lib/constants";

const NAV: { title: string; url: string; icon: React.ElementType; roles?: Role[] }[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Labs", url: "/labs", icon: FlaskConical },
  { title: "Equipment", url: "/equipment", icon: Wrench },
  { title: "Reservations", url: "/reservations", icon: CalendarCheck },
  { title: "Checkouts", url: "/checkouts", icon: ArrowLeftRight },
  { title: "Inventory", url: "/inventory", icon: Boxes },
  { title: "Chemicals", url: "/chemicals", icon: FlaskRound },
  { title: "Maintenance", url: "/maintenance", icon: Hammer },
  { title: "Academics", url: "/academics", icon: GraduationCap },
  { title: "Incidents", url: "/incidents", icon: AlertTriangle },
  { title: "Procurement", url: "/procurement", icon: ShoppingCart },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Audit Log", url: "/audit", icon: ScrollText, roles: ["ADMIN", "LAB_MANAGER"] },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar({ role, orgName }: { role: string; orgName: string }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.roles || (item.roles as string[]).includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Logo className="size-4" aria-hidden="true" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">LabVault</span>
                  <span className="truncate text-xs text-muted-foreground">{orgName}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(item.url + "/")} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon aria-hidden="true" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          Multi-tenant · RBAC · Audit-ready
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
