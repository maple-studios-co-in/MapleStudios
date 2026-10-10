import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * One timer, many ticks. Modules register `(now) => Promise<void>` functions
 * (campaign sends, social publishing); each tick is isolated so one failing
 * never stops the others. Never runs under test — tests call ticks directly.
 */
export type Tick = (now: Date) => Promise<void>;

const ticks = new Map<string, Tick>();
let timer: NodeJS.Timeout | null = null;
let running = false;

export function registerTick(name: string, tick: Tick) {
  ticks.set(name, tick);
}

export async function runAllTicks(now = new Date()) {
  if (running) return; // a slow tick must not overlap the next one
  running = true;
  try {
    for (const [name, tick] of ticks) {
      try {
        await tick(now);
      } catch (err) {
        logger.error({ err, tick: name }, "scheduler: tick failed");
      }
    }
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (timer || !env.SCHEDULER_ENABLED || env.isTest) return;
  timer = setInterval(() => void runAllTicks(), env.SCHEDULER_INTERVAL_MS);
  timer.unref();
  logger.info({ every: env.SCHEDULER_INTERVAL_MS, ticks: [...ticks.keys()] }, "scheduler: started");
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
