"use client";

import { useRef, useState } from "react";
import { Copy, Trash2, Upload } from "lucide-react";

import { useAdmin } from "../AdminShell";
import { useCollection } from "./useCms";
import type { Category } from "@/lib/admin/cms/types";
import { Btn, Card, Confirm, Input, PageHead, Spinner, shortDate, useToast } from "./ui";
import type { MediaAsset } from "@/lib/admin/cms/types";

/** Asset library. The production console is Cloudinary-backed; here the
    files sit next to the JSON store and are served by
    /api/admin/cms/file/[id] — publicly (an <img> can't send the admin key),
    pinned to their type with nosniff. Deleting an asset deletes its file, so
    a removed upload stops being reachable at its URL. */
export default function Media() {
  const { key } = useAdmin();
  const { data, loading, error, reload, remove } = useCollection<MediaAsset>("media");
  // Media categories are the suggested folders (free text still works).
  const { data: categories } = useCollection<Category>("categories");
  const folders = (categories ?? []).filter((c) => c.group === "media").map((c) => c.name);
  const [folder, setFolder] = useState("maple/uploads");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<MediaAsset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { show, node: toast } = useToast();

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", folder);
      body.append("alt", alt);

      // FormData must set its own multipart boundary, so this one call cannot
      // go through adminFetch — that helper pins a JSON content-type.
      const res = await fetch("/api/admin/cms/upload", {
        method: "POST",
        headers: { "x-admin-key": key },
        body,
      });

      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Upload failed.");
      }
      setAlt("");
      await reload();
      show("Uploaded");
    } catch (e) {
      show(e instanceof Error ? e.message : "Upload failed.", true);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHead title="Media" sub="Asset library for images, video and PDFs used across the site." />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input list="media-folders" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="maple/uploads" />
          <datalist id="media-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <Input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="Alt text for next upload"
          />
          <div className="flex items-center">
            <input
              ref={input}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Btn variant="primary" onClick={() => input.current?.click()} disabled={busy}>
              <Upload size={12} /> {busy ? "Uploading…" : "Upload"}
            </Btn>
          </div>
        </div>
        <p className="mt-2 font-sans-luxury text-[11.5px] text-[#a2988b]">
          JPG, PNG, WebP, AVIF, GIF, MP4 or PDF — up to 8 MB.
        </p>
      </Card>

      {error ? <p className="mb-3 font-sans-luxury text-[12.5px] text-[#a3231b]">{error}</p> : null}

      {(data ?? []).length === 0 ? (
        <Card>
          <p className="py-12 text-center font-sans-luxury text-[13px] text-[#a2988b]">No media yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {(data ?? []).map((m) => (
            <Card key={m.id} pad={false} className="overflow-hidden">
              <div className="flex aspect-[4/3] items-center justify-center bg-[#f3e8d5]">
                {["jpg", "png", "webp", "avif", "gif"].includes(m.format) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.alt} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-sans-luxury text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b8178]">
                    {m.format}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate font-sans-luxury text-[12px] text-[#11100e]" title={m.filename}>
                  {m.filename}
                </p>
                <p className="font-sans-luxury text-[10.5px] text-[#a2988b]">
                  {(m.bytes / 1024).toFixed(0)} KB · {shortDate(m.createdAt)}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Btn
                    onClick={() => {
                      void navigator.clipboard.writeText(m.url);
                      show("URL copied");
                    }}
                  >
                    <Copy size={11} /> Copy URL
                  </Btn>
                  <button
                    aria-label="Delete asset"
                    onClick={() => setConfirming(m)}
                    className="cursor-pointer rounded-full p-1.5 text-[#8b8178] hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {confirming ? (
        <Confirm
          title="Delete this asset?"
          body={`${confirming.filename} will be removed from the library. Anything already referencing its URL will break.`}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await remove(confirming.id);
            show("Deleted");
            setConfirming(null);
          }}
        />
      ) : null}

      {toast}
    </>
  );
}
