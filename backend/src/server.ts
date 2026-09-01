import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

async function main() {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`api listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  // Drain in-flight requests before the process dies, so a rolling deploy
  // never cuts a booking mid-write.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received - shutting down`);

    const force = setTimeout(() => {
      logger.error("shutdown timed out - forcing exit");
      process.exit(1);
    }, 10_000);
    force.unref();

    server.close(async (err) => {
      if (err) logger.error({ err }, "error closing http server");
      await disconnectDb().catch((e) => logger.error({ err: e }, "error closing mongo"));
      clearTimeout(force);
      process.exit(err ? 1 : 0);
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandled rejection");
    void shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception");
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start");
  process.exit(1);
});
