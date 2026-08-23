import type { Metadata } from "next";
import AdminSlots from "@/components/pages/admin/AdminSlots";

export const metadata: Metadata = {
  title: "Slot manager — Maple Studios",
  robots: { index: false, follow: false },
};

/**
 * Studio-side calendar for the contact page's "Book a 30-minute call":
 * open/close half-hour slots, see who booked, free a slot. Guarded by the
 * MAPLE_ADMIN_KEY header on every API call (page itself holds no secrets).
 */
export default function AdminSlotsPage() {
  return (
    <main className="min-h-screen bg-[#fff3d3] pt-24 text-black">
      <AdminSlots />
    </main>
  );
}
