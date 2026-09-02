import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PAY_ROBOTS_METADATA } from "@/lib/security/robots-policy";

export const metadata: Metadata = {
  robots: PAY_ROBOTS_METADATA,
};

export default function PayLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
