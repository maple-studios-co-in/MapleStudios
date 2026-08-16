import type { Metadata } from "next";
import Navbar from "@/components/common/Navbar";
import EagleEffectPreview from "@/components/lab/EagleEffectPreview";

export const metadata: Metadata = {
  title: "Eagle clip test — Maple Studios",
  description:
    "Designer preview: attached white-head eagle clip, scrubbed on scroll in the about-hero stage. /about is unchanged.",
  robots: { index: false, follow: false },
};

/**
 * Isolated test page. Does not alter /about.
 * The stage is the attached clip, scroll-scrubbed — the motion is the video.
 */
export default function EagleEffectLabPage() {
  return (
    <main className="min-h-screen bg-[#fff3d3] text-black">
      <Navbar />
      <EagleEffectPreview />
    </main>
  );
}
