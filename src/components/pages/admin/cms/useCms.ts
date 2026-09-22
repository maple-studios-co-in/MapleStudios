"use client";

import { useCallback, useEffect, useState } from "react";

import { useAdmin } from "../AdminShell";

/**
 * Data access for the console.
 *
 * Rides the existing `adminFetch` from <AdminShell>, so the CMS modules share
 * ONE sign-in with the operations screens and never hold a second credential.
 * Small hand-rolled hooks rather than a query library — 18 modules of plain
 * list/detail traffic does not earn a cache layer, and this keeps the console
 * at zero added dependencies.
 */

const BASE = "/api/admin/cms";

type Result<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

async function unwrap(res: Response) {
  if (res.ok) return res.json();
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `Request failed (${res.status}).`);
}

/** GET a collection. */
export function useCollection<T>(resource: string): Result<T[]> & {
  create: (body: Partial<T>) => Promise<void>;
  update: (id: string, patch: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
} {
  const { adminFetch } = useAdmin();
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const body = (await unwrap(await adminFetch(`${BASE}/${resource}`))) as { rows: T[] };
      setData(body.rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, resource]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (body: Partial<T>) => {
      await unwrap(await adminFetch(`${BASE}/${resource}`, { method: "POST", body: JSON.stringify(body) }));
      await reload();
    },
    [adminFetch, resource, reload]
  );

  const update = useCallback(
    async (id: string, patch: Partial<T>) => {
      await unwrap(
        await adminFetch(`${BASE}/${resource}/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
      );
      await reload();
    },
    [adminFetch, resource, reload]
  );

  const remove = useCallback(
    async (id: string) => {
      await unwrap(await adminFetch(`${BASE}/${resource}/${id}`, { method: "DELETE" }));
      await reload();
    },
    [adminFetch, resource, reload]
  );

  const reorder = useCallback(
    async (ids: string[]) => {
      await unwrap(
        await adminFetch(`${BASE}/${resource}/reorder`, { method: "POST", body: JSON.stringify({ ids }) })
      );
      await reload();
    },
    [adminFetch, resource, reload]
  );

  return { data, error, loading, reload, create, update, remove, reorder };
}

/** GET/PUT a singleton document (homepage, settings). */
export function useDoc<T>(key: string): Result<T> & { save: (doc: T) => Promise<void> } {
  const { adminFetch } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const body = (await unwrap(await adminFetch(`${BASE}/doc/${key}`))) as { doc: T };
      setData(body.doc);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (doc: T) => {
      const body = (await unwrap(
        await adminFetch(`${BASE}/doc/${key}`, { method: "PUT", body: JSON.stringify({ doc }) })
      )) as { doc: T };
      setData(body.doc);
    },
    [adminFetch, key]
  );

  return { data, error, loading, reload, save };
}

/** Any GET endpoint that is not a collection (dashboard, site-copy). */
export function useEndpoint<T>(path: string): Result<T> & { setData: (v: T) => void } {
  const { adminFetch } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setData((await unwrap(await adminFetch(`${BASE}${path}`))) as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** POST helper for the one-off actions (save copy version, restore). */
export function usePost() {
  const { adminFetch } = useAdmin();
  return useCallback(
    async <T,>(path: string, body: unknown): Promise<T> =>
      (await unwrap(
        await adminFetch(`${BASE}${path}`, { method: "POST", body: JSON.stringify(body) })
      )) as T,
    [adminFetch]
  );
}
