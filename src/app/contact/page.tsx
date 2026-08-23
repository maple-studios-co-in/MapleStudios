import type { Metadata } from "next";
import Navbar from "@/components/common/Navbar";
import Footer from "@/components/common/Footer";
import GradientCycler from "@/components/common/GradientCycler";
import StripExit from "@/components/common/StripExit";
import {
  ContactHero,
  ContactMaroon,
  ContactQuestions,
} from "@/components/pages/contact/ContactBody";
import { CONTACT_PAGE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact — Maple Studios",
  description: CONTACT_PAGE.hero.subtitle,
};

/**
 * Contact — Figma frame 20:3 (1512x4158).
 * ONE viewport-locked gradient + cycling shades across the whole dark region
 * (the /work-page treatment) — hero and form share the exact same ground, no
 * per-section radial seam. The hero PINS while maroon strips cover it
 * (trionn/contact behaviour) straight into the form; the maroon block then
 * exits through the cream strip effect and Questions rides over its cover.
 */
export default function ContactPage() {
  return (
    <main
      className="relative isolate min-h-screen text-white selection:bg-[#761c17] selection:text-white"
      style={{
        background:
          "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%) fixed",
      }}
    >
      <GradientCycler fixed />
      <Navbar />
      {/* The hero PINS while maroon strips grow over it — the screen holds
          still so the effect is actually watchable — and only once the cover
          is complete does the form slide up over it (z-20 + -mt-[90vh], the
          same hand-off KeyFacts uses on the home page). */}
      <StripExit color="#741a14">
        <ContactHero />
      </StripExit>
      <StripExit className="relative z-20 -mt-[90vh]">
        <ContactMaroon />
      </StripExit>
      <ContactQuestions />
      <Footer />
    </main>
  );
}
