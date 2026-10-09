import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/constants";

/** Everything public is crawlable; the console and the API are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
