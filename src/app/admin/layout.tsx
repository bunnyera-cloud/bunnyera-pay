import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BACKOFFICE_ROBOTS_METADATA } from "@/lib/security/robots-policy";

export const metadata: Metadata = {
  robots: BACKOFFICE_ROBOTS_METADATA,
};

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
