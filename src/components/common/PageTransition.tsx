"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import MapleLeafMark from "@/components/common/MapleLeafMark";

/**
 * trionn.com route transition, rebuilt in the Maple palette: clicking any
 * internal link grows 10 cream belts over the page (organic scatter order),
 * the maple leaf pops into the centre with the destination's name under it,
 * the route swaps UNDER the solid cream cover (scroll reset included), then
 * the belts release with the same scatter and the new page is simply there.
 *
 * One instance lives in the root layout. It intercepts document clicks in
 * the capture phase and calls preventDefault — next/link checks
 * `defaultPrevented` and stands down, so both <Link> and plain <a> ride the
 * same choreography without touching any nav component.
 */
const BANDS = 10;
/** Same organic scatter as StripExit — the two strip effects must feel related. */
const ORDER = [6, 2, 9, 4, 0, 7, 3, 8, 1, 5];
const STEP_S = 0.035; // per-belt stagger
const COVER_S = 0.45; // one belt's grow time
const REVEAL_S = 0.55; // one belt's release time
/** Logo LEADS the sequence: it pops the moment the cover starts forming
    (soft cream halo keeps it legible over the half-covered page), the belts
    then finish around it — "first the logo, then the strip transition". */
const LOGO_DELAY_S = 0.08;
const HOLD_MS = 260; // brief logo dwell on the solid cover, after the route swap
const COVER_MS = (COVER_S + (BANDS - 1) * STEP_S) * 1000;
const REVEAL_MS = (REVEAL_S + (BANDS - 1) * STEP_S) * 1000;
/** Fail-safe: never hold a solid cream screen longer than this waiting on a route. */
const STUCK_MS = 6000;

const PAGE_LABELS: Record<string, string> = {
  "/": "HOME",
  "/about": "ABOUT STUDIO",
  "/work": "OUR WORK",
  "/services": "OUR SERVICES",
  "/contact": "CONTACT",
};

function labelFor(href: string) {
  const path = href.split("#")[0].split("?")[0];
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "work" && seg[1]) return seg[1].replace(/-/g, " ").toUpperCase();
  return (seg[0] ?? "HOME").replace(/-/g, " ").toUpperCase();
}

type Phase = "idle" | "cover" | "reveal";

export default function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("");
  // The in-flight destination. Doubles as the "busy" latch: while set, every
  // further link click is swallowed so the choreography can't be re-entered.
  const pending = useRef<string | null>(null);
  const pushed = useRef(false);
  const stuckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settle = useCallback((next: Phase) => {
    if (stuckTimer.current) clearTimeout(stuckTimer.current);
    stuckTimer.current = null;
    setPhase(next);
  }, []);

  /* Click interception — capture phase so it precedes next/link's handler. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      // internal, non-hash, non-download, same-tab navigations only
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const path = href.split("#")[0].split("?")[0];
      if (!path || path === pathname) return;
      e.preventDefault();
      if (pending.current) return;
      pending.current = href;
      pushed.current = false;
      setLabel(labelFor(href));
      setPhase("cover");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  /* Cover finished → push the route while the screen is solid cream. */
  useEffect(() => {
    if (phase !== "cover") return;
    const push = setTimeout(() => {
      if (pending.current && !pushed.current) {
        pushed.current = true;
        router.push(pending.current);
      }
    }, COVER_MS);
    // If the new route never lands (offline, error boundary), release anyway.
    stuckTimer.current = setTimeout(() => {
      pending.current = null;
      settle("reveal");
    }, STUCK_MS);
    return () => clearTimeout(push);
  }, [phase, router, settle]);

  /* New route mounted under the cover → reset scroll, hold a beat, release. */
  useEffect(() => {
    if (!pending.current || !pushed.current) return;
    const target = pending.current.split("#")[0].split("?")[0];
    if (pathname !== target) return;
    window.scrollTo(0, 0);
    const t = setTimeout(() => {
      pending.current = null;
      settle("reveal");
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [pathname, settle]);

  /* Release finished → back to idle (overlay becomes inert + invisible). */
  useEffect(() => {
    if (phase !== "reveal") return;
    const t = setTimeout(() => settle("idle"), REVEAL_MS + 80);
    return () => clearTimeout(t);
  }, [phase, settle]);

  const active = phase !== "idle";
  const covering = phase === "cover";

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] ${active ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* Cream belts — stacked rows, each growing from its own centre line.
          Same -overlap trick as StripExit so no hairline seams show. */}
      {Array.from({ length: BANDS }, (_, i) => (
        <motion.div
          key={i}
          initial={false}
          animate={{ scaleY: covering ? 1.03 : 0 }}
          transition={{
            duration: covering ? COVER_S : REVEAL_S,
            ease: [0.65, 0, 0.35, 1],
            delay: (covering ? ORDER[i % ORDER.length] : ORDER[(BANDS - 1 - i) % ORDER.length]) * STEP_S,
          }}
          style={{ top: `${(i / BANDS) * 100}%`, height: `${100 / BANDS + 0.4}%`, scaleY: 0 }}
          className="absolute inset-x-0 origin-center bg-[#fff3d3] will-change-transform"
        />
      ))}

      {/* Centre: maple leaf + destination label, framed by four faint "+" marks.
          Arrives only after the belts have mostly covered (delay), leaves fast. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          initial={false}
          animate={
            covering
              ? { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, delay: LOGO_DELAY_S, ease: [0.22, 1, 0.36, 1] } }
              : { opacity: 0, scale: 0.94, y: -6, transition: { duration: 0.24, ease: "easeIn" } }
          }
          style={{ opacity: 0 }}
          className="relative flex flex-col items-center px-14 py-12 text-[#741a14]"
        >
          {/* Cream halo — the mark stays legible while the belts are still
              growing beneath it (the logo arrives BEFORE the cover is solid) */}
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -z-10 h-[150%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, rgba(255,243,211,0.95) 0%, rgba(255,243,211,0.75) 55%, rgba(255,243,211,0) 78%)",
              filter: "blur(6px)",
            }}
          />
          {["left-0 top-0", "right-0 top-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos) => (
            <span key={pos} className={`absolute ${pos} font-sans-luxury text-[15px] leading-none text-[#741a14]/45`}>
              +
            </span>
          ))}
          <MapleLeafMark className="w-[clamp(120px,14vw,210px)]" />
          <motion.p
            initial={false}
            animate={
              covering
                ? { opacity: 1, y: 0, transition: { duration: 0.35, delay: LOGO_DELAY_S + 0.12 } }
                : { opacity: 0, y: 4, transition: { duration: 0.18 } }
            }
            style={{ opacity: 0 }}
            className="mt-7 font-sans-luxury text-[max(13px,0.9vw)] font-bold uppercase tracking-[0.32em]"
          >
            {label}
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
