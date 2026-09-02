import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW } from "@/lib/security/robots-policy";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW],
    },
  };
}
