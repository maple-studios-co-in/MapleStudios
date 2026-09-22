import { seoFor } from "@/lib/admin/cms/seo";

/**
 * The console's JSON-LD for one page, if it has any. Re-parsed and
 * re-serialised rather than echoed, with `<` escaped, so nothing inside the
 * data can close the script tag.
 */
export default async function SeoJsonLd({ path }: { path: string }) {
  const entry = await seoFor(path);
  if (!entry?.jsonLd?.trim()) return null;

  let data: unknown;
  try {
    data = JSON.parse(entry.jsonLd);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
