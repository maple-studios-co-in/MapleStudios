import type { Metadata } from "next";
import Navbar from "@/components/common/Navbar";
import Footer from "@/components/common/Footer";
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
 * Cream hero → maroon form + info columns → cream Questions accordion.
 * The frame's own navbar/footer are handled by the shared components.
 */
export default function ContactPage() {
  return (
    <main className="relative min-h-screen bg-[#5d1411] text-white selection:bg-[#761c17] selection:text-white">
      <Navbar />
      <ContactHero />
      <ContactMaroon />
      <ContactQuestions />
      <Footer />
    </main>
  );
}
