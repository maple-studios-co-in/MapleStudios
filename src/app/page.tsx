import Navbar from "@/components/common/Navbar";
import SceneBackdrop from "@/components/common/SceneBackdrop";
import StripExit from "@/components/common/StripExit";
import HeroSection from "@/components/sections/HeroSection";
import AboutSection from "@/components/sections/AboutSection";
import KeyFactsSection from "@/components/sections/KeyFactsSection";
import WorkSection from "@/components/sections/WorkSection";
import ServicesVideoSection from "@/components/sections/ServicesVideoSection";
import ClientStoriesSection from "@/components/sections/ClientStoriesSection";
import Footer from "@/components/common/Footer";
import { getClientStories, getHeroCopy, getSiteCopy, getWorkProjects } from "@/lib/admin/cms/public";
import type { Metadata } from "next";
import SeoJsonLd from "@/components/common/SeoJsonLd";
import { withSeo } from "@/lib/admin/cms/seo";

/* Content comes from the authoring console, so this route must not be held
   in the full route cache — a publish/unpublish has to be visible on the
   next request, not at the next deploy. */
export const revalidate = 0;

/** The layout's metadata, with any override from the console's SEO module. */
export async function generateMetadata(): Promise<Metadata> {
  return withSeo("/");
}

export default async function Home() {
  // Testimonials from the authoring console (shipped constant is the fallback).
  const [stories, heroCopy, copy, work] = await Promise.all([
    getClientStories(),
    getHeroCopy(),
    getSiteCopy(),
    getWorkProjects(),
  ]);
  // Shipped project id → its live /work slug, so the homepage track only
  // links to case studies that are actually published.
  const workLinks = Object.fromEntries(work.map((p) => [p.artKey ?? p.id, p.id]));

  // overflow-x lives on <body> as `clip` (globals.css) — an overflow-x-hidden
  // wrapper here would break position:sticky for the horizontal work track
  return (
    // NO background colour here on purpose. <SceneBackdrop> sits at -z-10,
    // and because this element is `relative` with z-index:auto it never forms
    // a stacking context — so an opaque background here paints OVER the
    // backdrop (negative-z children escape to the root stacking context) and
    // hides the whole cycling gradient. The base maroon lives on <html>
    // (globals.css), which the backdrop correctly paints above.
    <main className="relative min-h-screen text-white selection:bg-[#761c17] selection:text-white">
      <SeoJsonLd path="/" />
      {/* Global Navbar */}
      <Navbar />

      {/* ONE fixed maroon scene shared by the hero, the About screen and the
          marquee band — no per-section gradients, so no seam between them */}
      <SceneBackdrop />

      {/* 1) Hero (Figma node 120-980: headline top-left, orbits, glassy M) */}
      <HeroSection copy={heroCopy} />

      {/* 2) About & Mission — the statement headline itself transitions inside
          the hero pin (Scene B in HeroSection); this block carries the rest of
          About and its marquee screen pins under the cream strip exit. */}
      <StripExit>
        <AboutSection />
      </StripExit>

      {/* 3) Key Facts (cream #FFF3D3 canvas) */}
      <KeyFactsSection />

      {/* 4+5) Selected work — the horizontal track flows straight into the
          services stage (video, type burst, DNA-spawned cards) with no
          vertical hop, then exits through the pinned strip transition.
          ServicesVideoSection is the mobile-only fallback. */}
      <StripExit>
        <WorkSection links={workLinks} />
        <ServicesVideoSection />
      </StripExit>

      {/* 6) Client stories (Figma 13-79xx) */}
      <ClientStoriesSection stories={stories} copy={copy.clientStories} />

      {/* 7) Final CTA / footer — "Ready to build something bold?" (Figma 13-8015) */}
      <Footer />
    </main>
  );
}
