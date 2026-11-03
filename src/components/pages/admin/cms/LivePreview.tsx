"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";

import { Btn, Card, Select, Spinner } from "./ui";

/** A public page (or a section of one, via a #anchor) the screen edits. */
export type PreviewTarget = { label: string; path: string };

type Device = "desktop" | "tablet" | "phone";
const DEVICES: { id: Device; label: string; width: number | null; Icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", width: null, Icon: Monitor },
  { id: "tablet", label: "Tablet", width: 820, Icon: Tablet },
  { id: "phone", label: "Phone", width: 390, Icon: Smartphone },
];

/** `path` with a cache-busting query, placed before any #anchor so the anchor still scrolls. */
function previewUrl(path: string, nonce: number) {
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}_preview=${nonce}${hash ? `#${hash}` : ""}`;
}

/**
 * The live website, framed inside the console, so an operator sees exactly
 * what visitors see for the section they are editing — same origin, same
 * render, no mock. The public pages render per request, so bumping
 * `refreshKey` after a save reloads the frame with the change in it.
 */
export default function LivePreview({
  targets,
  title = "Live preview",
  refreshKey = 0,
  defaultOpen = true,
  height = 620,
}: {
  targets: PreviewTarget[];
  title?: string;
  /** change it after a save and the frame reloads */
  refreshKey?: number;
  defaultOpen?: boolean;
  height?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [target, setTarget] = useState(0);
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  // a save elsewhere on the screen → fresh render of the public page
  useEffect(() => {
    if (refreshKey) {
      setNonce(Date.now());
      setLoaded(false);
    }
  }, [refreshKey]);

  const current = targets[Math.min(target, targets.length - 1)];
  if (!current) return null;
  const width = DEVICES.find((d) => d.id === device)?.width ?? null;

  return (
    <Card className="mb-5" pad={false}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex cursor-pointer items-center gap-2 font-sans-luxury text-[10px] font-bold uppercase tracking-[0.18em] text-[#741a14]"
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {title}
        </button>
        <span className="font-sans-luxury text-[11.5px] italic text-[#a2988b]">— exactly what visitors see</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {targets.length > 1 ? (
            <div className="min-w-[200px]">
              <Select
                value={String(target)}
                onChange={(e) => {
                  setTarget(Number(e.target.value));
                  setLoaded(false);
                }}
                options={targets.map((t, i) => ({ value: String(i), label: t.label }))}
              />
            </div>
          ) : null}
          <div className="flex rounded-full border border-[#d8c3a5]/70 p-0.5">
            {DEVICES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                title={label}
                onClick={() => setDevice(id)}
                className={`cursor-pointer rounded-full p-1.5 transition-colors ${
                  device === id ? "bg-[#741a14] text-[#fff8ed]" : "text-[#8b8178] hover:text-[#741a14]"
                }`}
              >
                <Icon size={13} />
              </button>
            ))}
          </div>
          <Btn
            onClick={() => {
              setNonce(Date.now());
              setLoaded(false);
            }}
          >
            <RefreshCw size={12} /> Refresh
          </Btn>
          <a
            href={current.path}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-[#d8c3a5]/70 px-3 py-1.5 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.08em] text-[#741a14] hover:bg-[#741a14]/10"
          >
            <ExternalLink size={12} /> Open
          </a>
        </div>
      </div>

      {open ? (
        <div className="relative border-t border-[#d8c3a5]/45 bg-[#efe3cc]/60 px-4 py-4">
          {!loaded ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#fff8ed]/70">
              <Spinner />
            </div>
          ) : null}
          <div
            className="mx-auto overflow-hidden rounded-[10px] border border-[#d8c3a5]/60 bg-white shadow-sm transition-[max-width] duration-300"
            style={{ maxWidth: width ?? "100%" }}
          >
            {/* The frame is same-origin: it renders the real page with the real
                data, including whatever was just saved. */}
            <iframe
              key={`${current.path}-${nonce}`}
              src={previewUrl(current.path, nonce)}
              title={`Preview of ${current.label}`}
              onLoad={() => setLoaded(true)}
              style={{ width: "100%", height, display: "block", border: 0 }}
            />
          </div>
          <p className="mt-2 text-center font-sans-luxury text-[11px] text-[#a2988b]">
            Scroll inside the frame. Changes appear after Save; press Refresh if the frame was already open.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
