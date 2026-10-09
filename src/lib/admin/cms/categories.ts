import { mutate } from "./store";
import type { Base, CategoryGroup, CollectionName } from "./types";

/** Where each category group is used: the collection, and the field on it that
    holds the category's name. */
const USED_BY: Record<CategoryGroup, { collection: CollectionName; field: string }> = {
  portfolio: { collection: "portfolio", field: "category" },
  blog: { collection: "blog", field: "category" },
  media: { collection: "media", field: "folder" },
};

/**
 * Carry a category rename onto every record already using the old name, so
 * "renaming a category updates every project or post using it" is true.
 * Returns how many records changed.
 */
export async function renameCategoryUses(group: CategoryGroup, from: string, to: string): Promise<number> {
  const target = USED_BY[group];
  if (!target || !from || !to || from === to) return 0;
  const changed = await mutate<Base & Record<string, unknown>, number>(target.collection, (rows) => {
    const hits = rows.filter((r) => r[target.field] === from).length;
    if (!hits) return null;
    const now = new Date().toISOString();
    return {
      rows: rows.map((r) => (r[target.field] === from ? { ...r, [target.field]: to, updatedAt: now } : r)),
      result: hits,
    };
  });
  return changed ?? 0;
}
