import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { studioDays, isWeekday, toStartsAt } from "../lib/time.js";
import { Slot } from "../modules/slots/slot.model.js";
import { AdminUser, hashPassword } from "../modules/auth/admin.model.js";
import { Inquiry } from "../modules/inquiries/inquiry.model.js";

/** Matches the pattern the current JSON store seeds. */
const TIMES = ["10:00", "10:30", "11:00", "15:00", "15:30", "16:00"];
const DAYS = 14;

async function main() {
  await connectDb();

  // Indexes ship as an explicit step, never as a container side effect.
  await Promise.all([Slot.syncIndexes(), Inquiry.syncIndexes(), AdminUser.syncIndexes()]);
  logger.info("indexes synced");

  let created = 0;
  for (const date of studioDays(DAYS)) {
    if (!isWeekday(date)) continue;
    for (const time of TIMES) {
      // Idempotent: re-running never duplicates or clears a booking.
      const r = await Slot.updateOne(
        { date, time },
        { $setOnInsert: { date, time, startsAt: toStartsAt(date, time), booking: null } },
        { upsert: true }
      ).exec();
      if (r.upsertedCount) created += 1;
    }
  }
  logger.info(`slots: ${created} created`);

  if (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD) {
    const exists = await AdminUser.findOne({ email: env.SEED_ADMIN_EMAIL }).exec();
    if (exists) {
      logger.info("admin already exists - leaving it alone");
    } else {
      await AdminUser.create({
        email: env.SEED_ADMIN_EMAIL,
        name: env.SEED_ADMIN_NAME ?? "Maple Studios",
        role: "owner",
        passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
      });
      logger.info(`admin created: ${env.SEED_ADMIN_EMAIL}`);
    }
  } else {
    logger.warn("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD unset - no admin created");
  }

  await disconnectDb();
}

main().catch((err) => {
  logger.fatal({ err }, "seed failed");
  process.exit(1);
});
