import type { MetadataRoute } from "next";
import { resolveBaseUrl } from "@/lib/payment/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = resolveBaseUrl();
  return [
    {
      url: `${base}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
