import { mutate, newId, stamp } from "./store";
import type { Base } from "./types";

type VideoRow = Base & Record<string, unknown> & { reelHero?: boolean };

/*
 * The reel hero is a single pin across the whole collection: promoting one
 * video has to demote whatever held it, or /reel renders two heroes. Create
 * and update both come through here, so the rule holds however the edit
 * arrives — and each is one locked write, so a concurrent edit can't slip a
 * second hero in between.
 */

export async function createPinnedVideo(data: Record<string, unknown>): Promise<VideoRow> {
  const row = await mutate<VideoRow, VideoRow>("video", (rows) => {
    const created = { ...data, id: newId(), ...stamp(), reelHero: true } as VideoRow;
    return { rows: [...rows.map((r) => ({ ...r, reelHero: false })), created], result: created };
  });
  return row as VideoRow;
}

/** Null when the video doesn't exist — and then nothing is unpinned. */
export function updatePinnedVideo(id: string, patch: Record<string, unknown>): Promise<VideoRow | null> {
  return mutate<VideoRow, VideoRow>("video", (rows) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) return null;
    const pinned = { ...rows[i], ...patch, id, updatedAt: new Date().toISOString() } as VideoRow;
    return { rows: rows.map((r, j) => (j === i ? pinned : { ...r, reelHero: false })), result: pinned };
  });
}
