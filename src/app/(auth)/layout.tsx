import Link from "next/link";
import { FlaskConical } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden lg:flex lg:w-1/2 items-center justify-center bg-emerald-950 text-emerald-50 p-12">
        <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="relative max-w-md space-y-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white">
              <FlaskConical className="h-6 w-6" aria-hidden="true" />
            </div>
            <span className="text-2xl font-bold tracking-tight">LabVault</span>
          </Link>
          <h2 className="text-3xl font-bold leading-tight">
            The control center for your institution&apos;s laboratories.
          </h2>
          <p className="text-emerald-200/90 leading-relaxed">
            Equipment lifecycle, reservations, inventory, chemical safety, maintenance schedules,
            academic sessions and procurement — unified in one multi-tenant platform with
            role-based access control and a complete audit trail.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-2">
            {[
              { k: "14", v: "Modules" },
              { k: "5", v: "Roles" },
              { k: "100%", v: "Audit coverage" },
            ].map((s) => (
              <div key={s.v}>
                <div className="text-2xl font-bold">{s.k}</div>
                <div className="text-xs text-emerald-300">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6 min-h-screen lg:min-h-0">
        {children}
      </div>
    </div>
  );
}
