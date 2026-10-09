import type { Metadata } from "next";
import Navbar from "@/components/common/Navbar";
import Footer from "@/components/common/Footer";
import ServicesBody from "@/components/pages/services/ServicesBody";
import { SERVICES_PAGE } from "@/lib/constants";
import { getServicePanels, getSiteCopy } from "@/lib/admin/cms/public";
import SeoJsonLd from "@/components/common/SeoJsonLd";
import { withSeo } from "@/lib/admin/cms/seo";

/* Content comes from the authoring console, so this route must not be held
   in the full route cache — a publish/unpublish has to be visible on the
   next request, not at the next deploy. */
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  // the page's own metadata, with any override from the console's SEO module
  return withSeo("/services", {
    title: "Services — Maple Studios",
    description: SERVICES_PAGE.hero.subtitle,
  });
}

/**
 * Services — Figma frame 14:8638 (1512x6719).
 * The gradient hero ("Area of expertise" + intro + marquee) lives inside
 * ServicesBody as one continuous scene; shared Navbar / Footer replace the
 * frame's own header and footer regions.
 */
export default async function ServicesPage() {
  // Console copy merged onto the shipped panel art direction.
  const [panels, copy] = await Promise.all([getServicePanels(), getSiteCopy()]);

  return (
    <main className="relative min-h-screen bg-[#5d1411] text-white selection:bg-[#761c17] selection:text-white">
      <Navbar />
      <SeoJsonLd path="/services" />
      <ServicesBody panels={panels} copy={{ hero: copy.services.hero, intro: copy.services.intro }} />
      <Footer />
    </main>
  );
}
