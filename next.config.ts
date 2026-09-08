import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // NOTE: X-Frame-Options is intentionally NOT set — the app must render
  // inside the sandbox preview iframe. For production deployments add:
  // { key: "X-Frame-Options", value: "DENY" }
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // The integration test suite boots a SECOND dev server on port 3100.
  // Next.js 16 takes a project-level dev lock inside distDir, so test
  // servers must use their own build directory to coexist with the
  // interactive server. Set NEXT_DIST_DIR for test/e2e environments only.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
