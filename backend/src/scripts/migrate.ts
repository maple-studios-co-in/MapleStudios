import { logger } from "../lib/logger.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connectDb, disconnectDb } from "../config/db.js";
import { importLegacyData } from "./legacy-import.js";
const dataDir = path.resolve(
  process.env.LEGACY_DATA_DIR || path.join(process.cwd(), "..", "data"),
);
async function main() {
  // Both files must exist: an absent or corrupt snapshot is not an empty store.
  const [inquiries, bookings] = await Promise.all(
    ["inquiries.json", "bookings.json"].map(async (name) =>
      JSON.parse(await readFile(path.join(dataDir, name), "utf8")),
    ),
  );
  await connectDb();
  try {
    logger.info(
      await importLegacyData(
        { inquiries: inquiries.inquiries, slots: bookings.slots },
        process.argv.includes("--dry-run"),
      ),
    );
  } finally {
    await disconnectDb();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check source validation and database connectivity; keep the source snapshot for recovery.",
  );
  process.exitCode = 1;
});
