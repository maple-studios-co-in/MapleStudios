import { SITE_COPY_DEFAULT } from "./seed";
import { mutateDoc } from "./store";
import type { SiteCopy, SiteCopyVersion } from "./types";

/** Every version is kept so Restore is always available, capped so the
    history panel stays readable. */
const MAX_VERSIONS = 40;

/**
 * Append a version and make it live, under the document's lock. Save and
 * Restore both come through here, so they share the numbering and the cap.
 * `make` returns null to abort (nothing is written, and this returns null).
 */
export function appendSiteCopyVersion(
  make: (doc: SiteCopy) => Pick<SiteCopyVersion, "json" | "summary" | "restoredFrom"> | null
): Promise<SiteCopy | null> {
  return mutateDoc<SiteCopy, SiteCopy>("site-copy", SITE_COPY_DEFAULT, (doc) => {
    const entry = make(doc);
    if (!entry) return null;
    const v = Math.max(0, ...doc.versions.map((x) => x.v)) + 1;
    const next: SiteCopy = {
      live: v,
      versions: [{ ...entry, v, at: new Date().toISOString(), who: "admin" }, ...doc.versions].slice(
        0,
        MAX_VERSIONS
      ),
    };
    return { doc: next, result: next };
  });
}
