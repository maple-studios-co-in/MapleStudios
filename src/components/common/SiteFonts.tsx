"use client";

import { usePathname } from "next/navigation";

export default function SiteFonts() {
  const path = usePathname();
  if (path === "/sign" || path?.startsWith("/sign/")) return null;
  // The App Router root applies the stylesheet except on private signing routes.
  // eslint-disable-next-line @next/next/no-page-custom-font
  return <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,300..800;1,300..800&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Red+Hat+Display:ital,wght@0,300..900;1,300..900&display=swap" />;
}
