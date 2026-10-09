import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { CMS_DIR, MEDIA_DIR } from "./paths";
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
 * Three rules keep it honest on a single-process server:
 *  - Reads never write. A collection nobody has edited has no file and reads
 *    as its seed (derived from constants.ts), so until an operator saves
 *    something the site keeps following constants.ts and a code change there
 *    still ships. The first mutation writes the file.
 *  - Every read-modify-write of a file runs under that file's lock (`mutate`),
 *    so overlapping requests can't lose each other's changes.
 *  - Every write goes to a unique temp file that is then renamed into place,
 *    so neither a crash nor a concurrent write can leave half a file behind.
 * More than one server process would need a real database.
 */

function fileFor(name: string) {
  return path.join(CMS_DIR, `${name}.json`);
}

/* ————— per-file lock ————— */

const queues = new Map<string, Promise<unknown>>();

/** Run `fn` once every earlier locked call for `name` has settled. */
function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(name) ?? Promise.resolve()).then(fn);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  queues.set(name, settled);
  void settled.then(() => {
    if (queues.get(name) === settled) queues.delete(name);
  });
  return run;
}

async function writeFileAtomic(name: string, value: unknown) {
  await fs.mkdir(CMS_DIR, { recursive: true });
  const target = fileFor(name);
  // Unique per write: a shared per-process temp name let two overlapping
  // writes truncate each other's bytes and rename a corrupt file into place.
  const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(tmp, target);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

/* ————— collections ————— */

/** Read a whole collection. One nobody has edited reads as its seed. */
export async function readAll<T>(name: CollectionName | string): Promise<T[]> {
  try {
    const raw = await fs.readFile(fileFor(name), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    // A copy: callers modify what they read, and the seed is module state
    // shared by every request in the process.
    return structuredClone(seedFor(name)) as T[];
  }
}

/** Replace a whole collection. */
export function writeAll<T>(name: CollectionName | string, rows: T[]): Promise<void> {
  return withLock(name, () => writeFileAtomic(name, rows));
}

/**
 * Read-modify-write one collection under its lock. `fn` gets the current rows
 * and returns the rows to store plus a result — or null to write nothing (the
 * target row doesn't exist, say), in which case `mutate` resolves to null.
 */
export function mutate<T, R>(
  name: CollectionName | string,
  fn: (rows: T[]) => { rows: T[]; result: R } | null
): Promise<R | null> {
  return withLock(name, async () => {
    const out = fn(await readAll<T>(name));
    if (!out) return null;
    await writeFileAtomic(name, out.rows);
    return out.result;
  });
}

/* ————— singletons (homepage, site-copy, settings) ————— */

export async function readDoc<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(fileFor(name), "utf8");
    return JSON.parse(raw) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return structuredClone(fallback);
  }
}

export function writeDoc<T>(name: string, doc: T): Promise<void> {
  return withLock(name, () => writeFileAtomic(name, doc));
}

/** `mutate` for a singleton document. */
export function mutateDoc<T, R>(
  name: string,
  fallback: T,
  fn: (doc: T) => { doc: T; result: R } | null
): Promise<R | null> {
  return withLock(name, async () => {
    const out = fn(await readDoc(name, fallback));
    if (!out) return null;
    await writeFileAtomic(name, out.doc);
    return out.result;
  });
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
  const row = await mutate<T, T>(name, (rows) => {
    const created = { ...(data as object), id: newId(), ...stamp() } as T;
    return { rows: [...rows, created], result: created };
  });
  return row as T;
}

export function updateRow<T extends Base>(
  name: CollectionName,
  id: Id,
  patch: Partial<T>
): Promise<T | null> {
  return mutate<T, T>(name, (rows) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) return null;
    const next = { ...rows[i], ...patch, id, updatedAt: new Date().toISOString() } as T;
    return { rows: rows.map((r, j) => (j === i ? next : r)), result: next };
  });
}

export async function deleteRow(name: CollectionName, id: Id): Promise<boolean> {
  const removed = await mutate<Base, true>(name, (rows) =>
    rows.some((r) => r.id === id) ? { rows: rows.filter((r) => r.id !== id), result: true } : null
  );
  return removed === true;
}

/** Apply an explicit id order, rewriting each row's `order` to its index.
    Ids not present are left after the ordered block, keeping their relative
    order — so a stale client list can never drop a row. */
export async function reorderRows(name: CollectionName, ids: Id[]): Promise<void> {
  await mutate<Base & { order?: number }, true>(name, (rows) => {
    const rank = new Map(ids.map((id, i) => [id, i]));
    const now = new Date().toISOString();
    const sorted = [...rows].sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra === undefined && rb === undefined) return (a.order ?? 0) - (b.order ?? 0);
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra - rb;
    });
    return { rows: sorted.map((r, i) => ({ ...r, order: i, updatedAt: now })), result: true };
  });
}

/** Delete an uploaded asset's file. Only a name the upload route itself mints
    is accepted, so a tampered media row can't aim this anywhere else. */
export async function removeMediaFile(url: unknown): Promise<void> {
  const name = /^\/api\/admin\/cms\/file\/([a-z0-9]{6,32}\.[a-z0-9]{2,4})$/i.exec(String(url ?? ""))?.[1];
  if (!name) return;
  await fs.rm(path.join(MEDIA_DIR, name), { force: true });
}
