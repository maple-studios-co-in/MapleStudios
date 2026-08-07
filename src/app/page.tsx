import Navbar from "@/components/common/Navbar";
import StripExit from "@/components/common/StripExit";
import HeroSection from "@/components/sections/HeroSection";
import AboutSection from "@/components/sections/AboutSection";
import KeyFactsSection from "@/components/sections/KeyFactsSection";
import WorkSection from "@/components/sections/WorkSection";
import ServicesVideoSection from "@/components/sections/ServicesVideoSection";
import ClientStoriesSection from "@/components/sections/ClientStoriesSection";
import Footer from "@/components/common/Footer";

export default function Home() {
  // overflow-x lives on <body> as `clip` (globals.css) — an overflow-x-hidden
  // wrapper here would break position:sticky for the horizontal work track
  return (
    <main className="relative bg-[#5d1411] min-h-screen text-white selection:bg-[#761c17] selection:text-white">
      {/* Global Navbar */}
      <Navbar />

      {/* 1) Hero (Figma node 120-980: headline top-left, orbits, glassy M) */}
      <HeroSection />

      {/* 2) About & Mission — the statement headline itself transitions inside
          the hero pin (Scene B in HeroSection); this block carries the rest of
          About and its marquee screen pins under the cream strip exit. */}
      <StripExit backdrop>
        <AboutSection />
      </StripExit>

      {/* 3) Key Facts (cream #FFF3D3 canvas) */}
      <KeyFactsSection />

      {/* 4+5) Selected work — the horizontal track flows straight into the
          services stage (video, type burst, DNA-spawned cards) with no
          vertical hop, then exits through the pinned strip transition.
          ServicesVideoSection is the mobile-only fallback. */}
      <StripExit>
        <WorkSection />
        <ServicesVideoSection />
      </StripExit>

      {/* 6) Client stories (Figma 13-79xx) */}
      <ClientStoriesSection />

      {/* 7) Final CTA / footer — "Ready to build something bold?" (Figma 13-8015) */}
      <Footer />
    </main>
  );
}
