import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../lib/logger.js";

mongoose.set("strictQuery", true);

export async function connectDb(uri: string = env.MONGODB_URI): Promise<void> {
  mongoose.connection.on("connected", () => logger.info("mongo: connected"));
  mongoose.connection.on("disconnected", () => logger.warn("mongo: disconnected"));
  mongoose.connection.on("error", (err) => logger.error({ err }, "mongo: error"));

  await mongoose.connect(uri, {
    dbName: env.MONGODB_DB,
    serverSelectionTimeoutMS: 8_000,
    maxPoolSize: 10,
    // Index builds are an explicit deploy step (npm run seed), never a
    // side effect of a container booting.
    autoIndex: !env.isProd,
  });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.connection.close();
}

/** 1 === connected. Used by /readyz. */
export const isDbHealthy = (): boolean => mongoose.connection.readyState === 1;
