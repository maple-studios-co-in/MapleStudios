import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { seedFor } from "./seed";
import type { Base, CollectionName, Id } from "./types";

/**
 * Tiny file-backed collection store for the authoring console.
 *
 * One JSON file per collection under /data/cms (gitignored). This deliberately
 * mirrors src/lib/bookings.ts rather than introducing a database: the console
 * has to run from a clean `npm run dev` with no services to start, and every
 * read/write goes through this module so swapping in Mongo later is a
 * single-file change.
 *
 * As with bookings, serverless hosts mount the deploy read-only, so writes go
 * to the tmp dir there — per-instance and wiped on cold start, which is fine
 * for a preview and wrong for production. That is the seam where a real
 * database goes.
 */
const DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "maple-cms")
  : path.join(process.cwd(), "data", "cms");

function fileFor(name: string) {
  return path.join(DIR, `${name}.json`);
}

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

/** Read a whole collection, seeding it on first touch so no screen is ever
    empty-by-accident on a fresh clone. */
export async function readAll<T>(name: CollectionName | string): Promise<T[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(fileFor(name), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const seed = seedFor(name) as T[];
    await writeAll(name, seed);
    return seed;
  }
}

/** Replace a whole collection. Writes to a temp file then renames so a crash
    mid-write cannot leave a half-written JSON file behind. */
export async function writeAll<T>(name: CollectionName | string, rows: T[]) {
  await ensureDir();
  const target = fileFor(name);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/* ————— singletons (homepage, site-copy, settings) ————— */

export async function readDoc<T>(name: string, fallback: T): Promise<T> {
  await ensureDir();
  try {
    const raw = await fs.readFile(fileFor(name), "utf8");
    return JSON.parse(raw) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    await writeDoc(name, fallback);
    return fallback;
  }
}

export async function writeDoc<T>(name: string, doc: T) {
  await ensureDir();
  const target = fileFor(name);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/* ————— CRUD helpers ————— */

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function stamp(): Pick<Base, "createdAt" | "updatedAt"> {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now };
}

export async function listRows<T extends Base>(name: CollectionName): Promise<T[]> {
  return readAll<T>(name);
}

export async function getRow<T extends Base>(name: CollectionName, id: Id): Promise<T | null> {
  const rows = await readAll<T>(name);
  return rows.find((r) => r.id === id) ?? null;
}

export async function createRow<T extends Base>(
  name: CollectionName,
  data: Omit<T, keyof Base>
): Promise<T> {
  const rows = await readAll<T>(name);
  const row = { ...(data as object), id: newId(), ...stamp() } as T;
  rows.push(row);
  await writeAll(name, rows);
  return row;
}

export async function updateRow<T extends Base>(
  name: CollectionName,
  id: Id,
  patch: Partial<T>
): Promise<T | null> {
  const rows = await readAll<T>(name);
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const next = { ...rows[i], ...patch, id, updatedAt: new Date().toISOString() } as T;
  rows[i] = next;
  await writeAll(name, rows);
  return next;
}

export async function deleteRow(name: CollectionName, id: Id): Promise<boolean> {
  const rows = await readAll<Base>(name);
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await writeAll(name, next);
  return true;
}

/** Apply an explicit id order, rewriting each row's `order` to its index.
    Ids not present are left after the ordered block, keeping their relative
    order — so a stale client list can never drop a row. */
export async function reorderRows(name: CollectionName, ids: Id[]): Promise<void> {
  const rows = await readAll<Base & { order?: number }>(name);
  const rank = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra === undefined && rb === undefined) return (a.order ?? 0) - (b.order ?? 0);
    if (ra === undefined) return 1;
    if (rb === undefined) return -1;
    return ra - rb;
  });
  rows.forEach((r, i) => {
    r.order = i;
    r.updatedAt = new Date().toISOString();
  });
  await writeAll(name, rows);
}
