"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, FlaskConical, ExternalLink, ShieldAlert } from "lucide-react";

const BOUNCE_FLAG = "lms_login_bounce";

const DEMO = [
  { label: "Admin", email: "admin@labvault.io" },
  { label: "Manager", email: "manager@labvault.io" },
  { label: "Instructor", email: "instructor@labvault.io" },
  { label: "Student", email: "student@labvault.io" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("admin@labvault.io");
  const [password, setPassword] = useState("Password@123");
  const [error, setError] = useState<string | null>(null);
  const [bounced, setBounced] = useState(false);
  const [loading, setLoading] = useState(false);

  // If we were sent back here right after a successful login, the browser is
  // dropping the session cookie (typically third-party cookie blocking inside
  // an embedded preview iframe). Warn instead of letting the user loop.
  useEffect(() => {
    if (sessionStorage.getItem(BOUNCE_FLAG)) {
      sessionStorage.removeItem(BOUNCE_FLAG);
      setBounced(true);
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      // Mark the attempt: if the dashboard bounces us back here, the login
      // page will detect the flag and show a cookie-blocking warning.
      sessionStorage.setItem(BOUNCE_FLAG, "1");
      // Full page navigation (more reliable than client-side push for
      // cookie-based session handoff, especially inside iframes).
      window.location.assign("/dashboard");
      // Keep the button in loading state while the browser navigates.
      await new Promise(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FlaskConical className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your LabVault workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@institute.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {bounced ? (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                <AlertDescription className="text-xs leading-relaxed">
                  Your browser is blocking the session cookie inside this embedded preview.
                  Use the <strong>“Open in New Tab”</strong> button above the preview panel, or{" "}
                  <a href="/dashboard" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">
                    open the app in a standalone tab
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  , then sign in again.
                </AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Sign in
            </Button>
          </form>

          <div className="mt-6 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Demo accounts — password: Password@123</p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO.map((d) => (
                <Button
                  key={d.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs h-8"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword("Password@123");
                  }}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create your organization
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
