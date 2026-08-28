import type { Metadata } from "next";
import AdminShell from "@/components/pages/admin/AdminShell";

export const metadata: Metadata = {
  title: "Studio admin — Maple Studios",
  robots: { index: false, follow: false },
};

/**
 * Every /admin route renders inside the shell: one key prompt, one nav, one
 * `adminFetch`. The marketing Navbar/Footer are deliberately NOT here — the
 * dashboard is a tool, and the site chrome brings fixed full-viewport overlays
 * (page transition belts, gradient cyclers) that have no business on it.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
