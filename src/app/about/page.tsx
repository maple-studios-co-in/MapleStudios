import type { Metadata } from "next";
import Navbar from "@/components/common/Navbar";
import Footer from "@/components/common/Footer";
import AboutBody, { AboutHero } from "@/components/pages/about/AboutBody";
import { ABOUT_PAGE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About — Maple Studios",
  description: ABOUT_PAGE.hero.subtitle,
};

/**
 * About — Figma frame 22:624 (1512x4158).
 * Cream throughout: statement hero over the eagle, AT MAPLE intro,
 * 24-hours badge + mission, and the six-row values list.
 */
export default function AboutPage() {
  return (
    <main className="relative min-h-screen bg-[#5d1411] text-white selection:bg-[#761c17] selection:text-white">
      <Navbar />
      <AboutHero />
      <AboutBody />
      <Footer />
    </main>
  );
}
