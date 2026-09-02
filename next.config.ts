import type { NextConfig } from "next";
import { buildSecurityHeaders, isProductionHttps } from "./src/lib/security/headers";

const securityHeaders = buildSecurityHeaders({
  production: process.env.NODE_ENV === "production",
  https: isProductionHttps(),
});

const backofficeRobots = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
const payRobots = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/dashboard", headers: backofficeRobots },
      { source: "/dashboard/:path*", headers: backofficeRobots },
      { source: "/admin", headers: backofficeRobots },
      { source: "/admin/:path*", headers: backofficeRobots },
      { source: "/api/:path*", headers: backofficeRobots },
      { source: "/pay", headers: payRobots },
      { source: "/pay/:path*", headers: payRobots },
      { source: "/preview", headers: payRobots },
      { source: "/preview/:path*", headers: payRobots },
    ];
  },
};

export default nextConfig;
