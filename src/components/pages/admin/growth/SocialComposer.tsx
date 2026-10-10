"use client";

import { useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";

import { useCollection } from "../cms/useCms";
import { Btn, Confirm, Field, Input, Modal, SectionLabel, Spinner, Textarea } from "../cms/ui";
import type { MediaAsset } from "@/lib/admin/cms/types";
import { useAction, useApi } from "./api";
import { Muted, TogglePill, isoToIstInput, istInputToIso } from "./shared";
import {
  PLATFORMS,
  PLATFORM_LABEL,
  PLATFORM_LIMIT,
  type Platform,
  type SocialPost,
  type SocialPostInput,
} from "./types";

/**
 * Write once, post to X / Instagram / LinkedIn. Character counts are per
 * platform (X 280, LinkedIn 3000, Instagram 2200); Instagram also needs an
 * image. Media URLs must be absolute https — the Media library picker
 * resolves the console's own asset URLs against the site origin.
 */
export default function SocialComposer({
  post,
  defaultDate,
  onClose,
  onSaved,
  show,
}: {
  post: SocialPost | null;
  /** "YYYY-MM-DD" to pre-fill the schedule when composing from a calendar day */
  defaultDate?: string;
  onClose: () => void;
  onSaved: (p: SocialPost) => void;
  show: (text: string, bad?: boolean) => void;
}) {
  const api = useApi();
  const { busy, run } = useAction(show);
  const [text, setText] = useState(post?.text ?? "");
  const [media, setMedia] = useState<string[]>(post?.mediaUrls ?? []);
  const [platforms, setPlatforms] = useState<Platform[]>(post?.platforms ?? ["linkedin"]);
  const [when, setWhen] = useState(
    post?.scheduledAt ? isoToIstInput(post.scheduledAt) : defaultDate ? `${defaultDate}T10:00` : ""
  );
  const [picking, setPicking] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const over = platforms.filter((p) => text.length > PLATFORM_LIMIT[p]);
  const needsImage = platforms.includes("instagram") && media.filter((u) => u.trim()).length === 0;
  const badMedia = media.some((u) => u.trim() && !/^https:\/\//i.test(u.trim()));
  const ready = text.trim().length > 0 && platforms.length > 0 && over.length === 0 && !needsImage && !badMedia;
  const whenIso = istInputToIso(when);

  const body = (): SocialPostInput => ({
    text,
    mediaUrls: media.map((u) => u.trim()).filter(Boolean),
    platforms,
    scheduledAt: whenIso || undefined,
  });

  /** Create or update, then optionally schedule / publish. */
  const commit = (after: "none" | "schedule" | "publish") =>
    run(
      after,
      async () => {
        const saved = post
          ? await api.request<{ item: SocialPost }>("PATCH", `/social/posts/${post.id}`, body())
          : await api.request<{ item: SocialPost }>("POST", "/social/posts", body());
        let final = saved.item;
        if (after === "schedule") {
          final = (
            await api.request<{ item: SocialPost }>("POST", `/social/posts/${final.id}/schedule`, { scheduledAt: whenIso })
          ).item;
        } else if (after === "publish") {
          final = (await api.request<{ item: SocialPost }>("POST", `/social/posts/${final.id}/publish-now`)).item;
        }
        onSaved(final);
      },
      after === "none" ? "Draft saved" : after === "schedule" ? "Post scheduled" : "Publishing…"
    );

  return (
    <Modal title={post ? "Edit post" : "New post"} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <Field label="Platforms">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PLATFORMS.map((p) => (
                <TogglePill
                  key={p}
                  on={platforms.includes(p)}
                  onClick={() =>
                    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
                  }
                >
                  {PLATFORM_LABEL[p]}
                </TogglePill>
              ))}
            </div>
          </Field>

          <div className="mt-3">
            <Field label="Text" required>
              <Textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="What's new at the studio…" autoFocus />
            </Field>
            <div className="mt-1.5 flex flex-wrap gap-3">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p);
                const n = text.length;
                const lim = PLATFORM_LIMIT[p];
                return (
                  <span
                    key={p}
                    className={`font-sans-luxury text-[11px] ${
                      !on ? "text-[#c3b8a8]" : n > lim ? "font-bold text-[#a3231b]" : "text-[#8b8178]"
                    }`}
                  >
                    {PLATFORM_LABEL[p]} {n}/{lim}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <SectionLabel>Media URLs</SectionLabel>
              <Muted>absolute https · Instagram needs at least one image</Muted>
            </div>
            <div className="space-y-2">
              {media.map((u, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={u}
                    onChange={(e) => {
                      const next = [...media];
                      next[i] = e.target.value;
                      setMedia(next);
                    }}
                    placeholder="https://…/image.jpg"
                  />
                  <button
                    type="button"
                    aria-label="Remove media"
                    onClick={() => setMedia(media.filter((_, j) => j !== i))}
                    className="shrink-0 cursor-pointer rounded-full p-2 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Btn onClick={() => setMedia([...media, ""])}>
                  <Plus size={12} /> Add URL
                </Btn>
                <Btn onClick={() => setPicking(true)}>
                  <ImagePlus size={12} /> Pick from Media library
                </Btn>
              </div>
            </div>
            {badMedia ? (
              <p role="alert" className="mt-2 font-sans-luxury text-[12px] text-[#a3231b]">
                Media URLs must start with https://
              </p>
            ) : null}
            {needsImage ? (
              <p role="alert" className="mt-2 font-sans-luxury text-[12px] text-[#a3231b]">
                Instagram has no text-only posts — add an image URL or drop Instagram.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <Field label="Schedule (IST)" hint="Leave empty to keep it as a draft">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>

          {media.filter((u) => /^https:\/\//i.test(u.trim())).length ? (
            <div className="mt-4">
              <SectionLabel>Media preview</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {media
                  .filter((u) => /^https:\/\//i.test(u.trim()))
                  .map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${u}-${i}`} src={u.trim()} alt="" className="aspect-square w-full rounded-[6px] object-cover" />
                  ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-[10px] border border-[#d8c3a5]/60 bg-[#f3e8d5]/40 p-3">
            <SectionLabel>How it goes out</SectionLabel>
            <ul className="space-y-1 font-sans-luxury text-[11.5px] leading-[1.5] text-[#6b6259]">
              <li>Each selected platform needs a connected account; others are skipped with an error.</li>
              <li>X and LinkedIn are text-only in this phase; media is used by Instagram.</li>
              <li>Scheduled posts go out within a minute of their time (IST shown, stored as an instant).</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[#d8c3a5]/45 pt-4">
        <Btn onClick={onClose} disabled={busy !== null}>
          Cancel
        </Btn>
        <Btn onClick={() => commit("none")} disabled={!text.trim() || busy !== null}>
          {busy === "none" ? "Saving…" : "Save draft"}
        </Btn>
        <Btn onClick={() => commit("schedule")} disabled={!ready || !whenIso || busy !== null}>
          {busy === "schedule" ? "Scheduling…" : "Schedule"}
        </Btn>
        <Btn variant="primary" onClick={() => setConfirmPublish(true)} disabled={!ready || busy !== null}>
          {busy === "publish" ? "Publishing…" : "Publish now"}
        </Btn>
      </div>

      {picking ? (
        <MediaPicker
          onPick={(url) => {
            setMedia((m) => [...m.filter((u) => u.trim()), url]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}

      {confirmPublish ? (
        <Confirm
          title="Publish now?"
          body={`This posts to ${platforms.map((p) => PLATFORM_LABEL[p]).join(", ")} immediately. Published posts cannot be edited here.`}
          confirmLabel="Publish"
          onCancel={() => setConfirmPublish(false)}
          onConfirm={() => {
            setConfirmPublish(false);
            void commit("publish");
          }}
        />
      ) : null}
    </Modal>
  );
}

/* ————— media library picker ————— */

const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "avif", "gif"];

function MediaPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const { data, loading, error } = useCollection<MediaAsset>("media");
  const images = (data ?? []).filter((m) => IMAGE_FORMATS.includes(m.format.toLowerCase()));

  const absolute = (url: string) => {
    try {
      return new URL(url, window.location.origin).href;
    } catch {
      return url;
    }
  };

  return (
    <Modal title="Pick an image" onClose={onClose}>
      {loading ? <Spinner /> : null}
      {error ? <p className="font-sans-luxury text-[12.5px] text-[#a3231b]">{error}</p> : null}
      {!loading && images.length === 0 ? (
        <p className="py-10 text-center font-sans-luxury text-[13px] text-[#a2988b]">
          No images in the Media library yet — upload one on the Media screen.
        </p>
      ) : (
        <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {images.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(absolute(m.url))}
              title={m.filename}
              className="cursor-pointer overflow-hidden rounded-[6px] border border-[#d8c3a5]/60 transition-colors hover:border-[#741a14]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt} className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 font-sans-luxury text-[11px] italic text-[#a2988b]">
        The picked URL is made absolute against this site&apos;s origin; the platforms fetch it from there.
      </p>
    </Modal>
  );
}
