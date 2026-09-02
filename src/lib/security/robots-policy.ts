/** Path rules for legitimate crawlers. This is not an access-control mechanism. */

export const ROBOTS_DISALLOW = [
  "/dashboard/",
  "/admin/",
  "/api/",
  "/pay/",
  "/preview/",
] as const;

export const PUBLIC_INDEXABLE_PATHS = ["/", "/login", "/register"] as const;

export function robotsTagForPathname(pathname: string): string | null {
  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  ) {
    return "noindex, nofollow";
  }
  if (
    pathname === "/pay" ||
    pathname.startsWith("/pay/") ||
    pathname === "/preview" ||
    pathname.startsWith("/preview/")
  ) {
    return "noindex, nofollow, noarchive";
  }
  return null;
}

export function isPublicMarketingPath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

export const PAY_ROBOTS_METADATA = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
} as const;

export const BACKOFFICE_ROBOTS_METADATA = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
} as const;
