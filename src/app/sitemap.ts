import type { MetadataRoute } from "next";

import { getWorkProjects } from "@/lib/admin/cms/public";
import { noindexPaths } from "@/lib/admin/cms/seo";
import { SITE_URL } from "@/lib/constants";

/* Built per request: it follows what the console has published, and drops any
   path an SEO override marks noindex. */
export const dynamic = "force-dynamic";

const PAGES = ["/", "/work", "/services", "/about", "/contact"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, hidden] = await Promise.all([getWorkProjects(), noindexPaths()]);
  return [...PAGES, ...projects.map((p) => `/work/${p.id}`)]
    .filter((path) => !hidden.has(path))
    .map((path) => ({ url: path === "/" ? SITE_URL : `${SITE_URL}${path}` }));
}
