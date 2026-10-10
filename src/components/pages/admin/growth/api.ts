"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { useAdmin } from "../AdminShell";
import type { ListMeta } from "./types";

/**
 * Data access for the growth screens.
 *
 * The browser talks to `/api/v2/*`, which next.config rewrites to the
 * backend's `/api/v1/*`, so everything is same-origin and the only credential
 * is the console's own `x-admin-key` — the same key <AdminShell> already
 * validated. The hooks are deliberately as small as cms/useCms.ts: plain
 * list/detail traffic, no cache layer, zero added dependencies.
 */

const BASE = "/api/v2";

export type ParamValue = string | number | boolean | string[] | undefined | null;
export type Params = Record<string, ParamValue>;

/** `?a=1&tags=x,y` — arrays join with commas (the contract's `stage`/`tags`
    convention), empty values are dropped so a blank filter sends nothing. */
export function qs(params?: Params): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
      continue;
    }
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** A non-2xx response. `status` and `code` let a screen react to one case
    (503 NOT_CONFIGURED on social connect) without string-matching messages. */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    details?: unknown;
  };
  throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.code, body.details);
}

export function errorMessage(e: unknown, fallback = "Something went wrong."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export type Api = {
  /** JSON request against `/api/v2`; resolves with the parsed body. */
  request: <T>(method: string, path: string, body?: unknown) => Promise<T>;
  /** POST a CSV file's text with `content-type: text/csv`. */
  uploadCsv: <T>(path: string, text: string, params?: Params) => Promise<T>;
  /** GET a file (the CSV export) with the key attached and save it. */
  download: (path: string, filename: string, params?: Params) => Promise<void>;
};

export function useApi(): Api {
  const { key } = useAdmin();

  return useMemo<Api>(() => {
    const request = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      const headers: Record<string, string> = { "x-admin-key": key };
      if (body !== undefined) headers["content-type"] = "application/json";
      const res = await fetch(`${BASE}${path}`, {
        method,
        cache: "no-store",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return unwrap<T>(res);
    };

    const uploadCsv = async <T,>(path: string, text: string, params?: Params): Promise<T> => {
      const res = await fetch(`${BASE}${path}${qs(params)}`, {
        method: "POST",
        cache: "no-store",
        headers: { "x-admin-key": key, "content-type": "text/csv" },
        body: text,
      });
      return unwrap<T>(res);
    };

    const download = async (path: string, filename: string, params?: Params) => {
      const res = await fetch(`${BASE}${path}${qs(params)}`, {
        cache: "no-store",
        headers: { "x-admin-key": key },
      });
      if (!res.ok) await unwrap<never>(res);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    return { request, uploadCsv, download };
  }, [key]);
}

export type ListState<T> = {
  items: T[];
  meta: ListMeta | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** optimistic local edits between reloads */
  setItems: Dispatch<SetStateAction<T[]>>;
};

/**
 * GET a `{ items, meta }` list. `params` is compared by value, so a screen can
 * pass a fresh object every render. A response that arrives after a newer
 * request was issued is dropped — fast filter typing must not let an old
 * page overwrite the current one. `loading` is only true before the first
 * response: reloads after a write keep the table on screen.
 */
export function useList<T>(path: string | null, params?: Params): ListState<T> {
  const { request } = useApi();
  const paramsKey = JSON.stringify(params ?? {});
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (path === null) return;
    const mine = ++seq.current;
    try {
      const body = await request<{ items: T[]; meta?: ListMeta }>(
        "GET",
        `${path}${qs(JSON.parse(paramsKey) as Params)}`
      );
      if (mine !== seq.current) return;
      setItems(body.items ?? []);
      setMeta(body.meta ?? null);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(errorMessage(e, "Could not load."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [request, path, paramsKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, meta, loading, error, reload, setItems };
}

export type ItemState<T> = {
  item: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setItem: Dispatch<SetStateAction<T | null>>;
};

/** GET a `{ item }` record. Pass `null` to render nothing (drawer closed). */
export function useItem<T>(path: string | null): ItemState<T> {
  const { request } = useApi();
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (path === null) {
      setItem(null);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    try {
      const body = await request<{ item: T }>("GET", path);
      if (mine !== seq.current) return;
      setItem(body.item);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(errorMessage(e, "Could not load."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [request, path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { item, loading, error, reload, setItem };
}

/**
 * Runs a write with the two things every button on these screens needs:
 * it is disabled while in flight (`busy === key`) and a failure lands in the
 * toast. Resolves true on success so callers can close a form.
 */
export function useAction(show: (text: string, bad?: boolean) => void) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, done?: string): Promise<boolean> => {
      setBusy(key);
      try {
        await fn();
        if (done) show(done);
        return true;
      } catch (e) {
        show(errorMessage(e), true);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [show]
  );

  return { busy, run };
}
