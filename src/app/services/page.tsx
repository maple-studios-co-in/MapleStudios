import type { Metadata } from "next";
import Navbar from "@/components/common/Navbar";
import Footer from "@/components/common/Footer";
import { PageHero } from "@/components/pages/PageKit";
import ServicesBody from "@/components/pages/services/ServicesBody";
import { SERVICES_PAGE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Services — Maple Studios",
  description: SERVICES_PAGE.hero.subtitle,
};

/**
 * Services — Figma frame 14:8638 (1512x6719).
 * Shared Navbar / Footer replace the frame's own header and footer regions.
 */
export default function ServicesPage() {
  return (
    <main className="relative min-h-screen bg-[#5d1411] text-white selection:bg-[#761c17] selection:text-white">
      <Navbar />
      <PageHero title={SERVICES_PAGE.hero.title} subtitle={SERVICES_PAGE.hero.subtitle} />
      <ServicesBody />
      <Footer />
    </main>
  );
}
