import Link from "next/link";
import {
  FlaskConical,
  Wrench,
  CalendarCheck,
  Boxes,
  FlaskRound,
  Hammer,
  GraduationCap,
  AlertTriangle,
  ShoppingCart,
  BarChart3,
  ScrollText,
  ShieldCheck,
  QrCode,
  Users,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MODULES = [
  { icon: FlaskConical, title: "Labs", desc: "Physical labs with capacity, status and manager assignment." },
  { icon: Wrench, title: "Equipment", desc: "Full lifecycle with QR codes, condition tracking and valuation." },
  { icon: CalendarCheck, title: "Reservations", desc: "Conflict-aware booking with approval workflow." },
  { icon: ArrowRight, title: "Checkouts", desc: "Check-out / check-in with due dates and overdue alerts." },
  { icon: Boxes, title: "Inventory", desc: "Stock levels, minimum thresholds and low-stock warnings." },
  { icon: FlaskRound, title: "Chemicals", desc: "CAS registry, hazard classes and expiry monitoring." },
  { icon: Hammer, title: "Maintenance", desc: "Preventive, corrective and calibration schedules." },
  { icon: GraduationCap, title: "Academics", desc: "Experiments, lab sessions and attendance tracking." },
  { icon: AlertTriangle, title: "Incidents", desc: "Severity-tagged safety reporting and resolution." },
  { icon: ShoppingCart, title: "Procurement", desc: "Vendors and purchase requests with approvals." },
  { icon: BarChart3, title: "Reports", desc: "Utilization, spending and operational analytics." },
  { icon: ScrollText, title: "Audit Log", desc: "Immutable trail of every consequential action." },
];

const FEATURES = [
  { icon: ShieldCheck, title: "RBAC + Multi-tenant", desc: "5 roles with permission-aware APIs. Every record is isolated per organization." },
  { icon: QrCode, title: "QR Equipment Tags", desc: "Every asset gets a scannable QR identity for instant lookup and audit." },
  { icon: Users, title: "Role Dashboards", desc: "Admins, managers, instructors, technicians and students each see what matters." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold tracking-tight">LabVault</span>
            <Badge variant="outline" className="ml-2 hidden sm:inline-flex">Multi-tenant SaaS</Badge>
          </div>
          <nav className="flex items-center gap-2" aria-label="Main navigation">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b bg-emerald-950 text-emerald-50">
          <div className="mx-auto max-w-6xl px-4 py-20 md:py-28 text-center space-y-6">
            <Badge variant="outline" className="border-emerald-700 text-emerald-300">
              Next.js 16 · TypeScript · Prisma · shadcn/ui
            </Badge>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight max-w-3xl mx-auto leading-tight">
              Run every laboratory like a well-calibrated instrument.
            </h1>
            <p className="text-lg text-emerald-200/90 max-w-2xl mx-auto">
              LabVault unifies equipment, reservations, inventory, chemicals, maintenance, academics,
              incidents and procurement behind role-based access control and a complete audit trail.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button size="lg" asChild className="bg-emerald-500 text-white hover:bg-emerald-400">
                <Link href="/login">Try the live demo</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="border-emerald-700 text-emerald-100 hover:bg-emerald-900 hover:text-white">
                <Link href="/register">Create your workspace</Link>
              </Button>
            </div>
            <p className="text-xs text-emerald-300/80">
              Demo login: admin@labvault.io · Password@123
            </p>
          </div>
        </section>

        {/* Feature highlights */}
        <section className="mx-auto max-w-6xl px-4 py-16" aria-label="Platform features">
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="border-2">
                <CardHeader className="pb-2">
                  <div className="mb-2 w-fit rounded-lg bg-primary/10 p-2.5">
                    <f.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg">{f.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{f.desc}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Modules */}
        <section className="border-t bg-muted/40" aria-label="Modules">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold tracking-tight">Fourteen modules. One platform.</h2>
              <p className="text-muted-foreground mt-2">Everything a modern lab operation needs — nothing it doesn&apos;t.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m) => (
                <div key={m.title} className="flex gap-3 rounded-lg border bg-background p-4">
                  <div className="mt-0.5 rounded-md bg-primary/10 p-2 h-fit">
                    <m.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{m.title}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to take control of your labs?</h2>
          <p className="text-muted-foreground mt-2">Spin up a workspace in under a minute. No credit card required.</p>
          <Button size="lg" className="mt-6" asChild>
            <Link href="/register">Create your organization</Link>
          </Button>
        </section>
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
            <span>LabVault — Lab Management System</span>
          </div>
          <div>Built with Next.js 16, Prisma & shadcn/ui · © {new Date().getFullYear()} Kaif Kenwey</div>
        </div>
      </footer>
    </div>
  );
}
