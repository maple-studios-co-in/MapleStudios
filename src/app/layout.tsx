import type { Metadata, Viewport } from "next";
import PageTransition from "@/components/common/PageTransition";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  // Resolves relative OG image and canonical URLs set in the console; emits no tag itself.
  metadataBase: new URL(SITE_URL),
  title: "Maple Studios — Independent Digital Studio",
  description: "Websites, AI products, brands, and systems built for clarity, scale and impact.",
  keywords: ["digital studio", "web design", "AI products", "branding", "strategy", "technology"],
  authors: [{ name: "Maple Studios" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased selection:bg-[#761c17] selection:text-white">
        {children}
        {/* Route transition: cream belts + centred maple leaf on every internal link */}
        <PageTransition />
      </body>
    </html>
  );
}
