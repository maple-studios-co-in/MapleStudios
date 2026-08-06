import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
      </body>
    </html>
  );
}
