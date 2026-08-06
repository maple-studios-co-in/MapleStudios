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

      {/* 2) About & Mission — its marquee screen pins while cream strips grow
          over it (trionn exit), then releases into Key Facts */}
      <StripExit>
        <AboutSection />
      </StripExit>

      {/* 3) Key Facts (cream #FFF3D3 canvas) */}
      <KeyFactsSection />

      {/* 4) Selected work & explorations + OUR SERVICES typography */}
      <WorkSection />

      {/* 5) Services cards over the new-era background video (Figma 2001-19),
          exiting through the same pinned strip transition */}
      <StripExit>
        <ServicesVideoSection />
      </StripExit>

      {/* 6) Client stories (Figma 13-79xx) */}
      <ClientStoriesSection />

      {/* 7) Final CTA / footer — "Ready to build something bold?" (Figma 13-8015) */}
      <Footer />
    </main>
  );
}
