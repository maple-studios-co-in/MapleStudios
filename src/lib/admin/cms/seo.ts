import type { Metadata } from "next";
import { cache } from "react";

import { readAll } from "./store";
import type { SeoEntry } from "./types";
import { normalisePath, safeHref } from "./url";

/**
 * The public side of the console's SEO module: per-path overrides laid over
 * each page's own metadata, and the JSON-LD for its <script> tag.
 *
 * A failed read means "no overrides" — SEO must never be the reason a page
 * doesn't render. `cache` shares one read between a page's generateMetadata
 * and its JSON-LD within a request.
 */
const entries = cache(async (): Promise<SeoEntry[]> => {
  try {
    return await readAll<SeoEntry>("seo");
  } catch {
    return [];
  }
});

export async function seoFor(path: string): Promise<SeoEntry | null> {
  const key = normalisePath(path);
  return (await entries()).find((e) => normalisePath(e.path) === key) ?? null;
}

/** Paths an override marks noindex — kept out of sitemap.xml. */
export async function noindexPaths(): Promise<Set<string>> {
  return new Set((await entries()).filter((e) => e.noindex).map((e) => normalisePath(e.path)));
}

/** `base` (the page's own metadata) with the override for `path` laid over it.
    Only fields the operator filled in replace anything. */
export async function withSeo(path: string, base: Metadata = {}): Promise<Metadata> {
  const e = await seoFor(path);
  if (!e) return base;

  const title = e.title?.trim() || undefined;
  const description = e.description?.trim() || undefined;
  const canonical = safeHref(e.canonical) || undefined;
  const image = safeHref(e.ogImage) || undefined;
  const ogTitle = e.ogTitle?.trim() || title;
  const ogDescription = e.ogDescription?.trim() || description;
  const social = Boolean(ogTitle || ogDescription || image);

  return {
    ...base,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(canonical ? { alternates: { ...base.alternates, canonical } } : {}),
    ...(e.noindex ? { robots: { index: false, follow: false } } : {}),
    ...(social
      ? {
          openGraph: {
            ...base.openGraph,
            ...(ogTitle ? { title: ogTitle } : {}),
            ...(ogDescription ? { description: ogDescription } : {}),
            ...(image ? { images: [image] } : {}),
          },
          twitter: {
            card: e.twitterCard === "summary" ? "summary" : "summary_large_image",
            ...(ogTitle ? { title: ogTitle } : {}),
            ...(ogDescription ? { description: ogDescription } : {}),
            ...(image ? { images: [image] } : {}),
          },
        }
      : {}),
  };
}
