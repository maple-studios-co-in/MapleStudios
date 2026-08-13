import type { Metadata } from "next";
import Navbar from "@/components/common/Navbar";
import Footer from "@/components/common/Footer";
import GradientCycler from "@/components/common/GradientCycler";
import WorkHero from "@/components/pages/work/WorkHero";
import WorkGrid from "@/components/pages/work/WorkGrid";
import { WORK_PAGE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Our Work — Maple Studios",
  description: WORK_PAGE.hero.subtitle,
};

/**
 * Our Work — Figma frame 14:8050 (1512x6879).
 * The frame's own navbar and footer are handled by the shared components.
 */
export default function WorkPage() {
  return (
    // One viewport-locked reddish gradient across the ENTIRE page — no beige —
    // with the auto-cycling shade variants layered on top (fixed, -z-10).
    <main
      className="relative isolate min-h-screen text-white selection:bg-[#761c17] selection:text-white"
      style={{
        background:
          "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%) fixed",
      }}
    >
      <GradientCycler fixed />
      <Navbar />
      {/* Floating thumbnails scatter away from "Our work" on scroll (trionn-style) */}
      <WorkHero />
      <WorkGrid />
      <Footer seamless />
    </main>
  );
}
