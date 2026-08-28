"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Auto-cycling reddish gradient — the 7 supplied shades (Default → Variant7)
 * crossfade sequentially (3.5s per shade) while the stack slowly pans/zooms,
 * so the light keeps travelling. Host element needs `relative isolate` (the
 * cycler sits at -z-10, below the host's content but above its background).
 * `fixed` renders viewport-locked for whole-page use.
 *
 * ————— WHY THIS IS A TWO-SLOT CROSSFADE, NOT A SEVEN-LAYER STACK —————
 * The original build mounted all 7 shades at once, each with
 * `will-change: opacity, transform` + `backface-visibility: hidden` + two
 * infinite animations. That pins SEVEN full-viewport composited layers per
 * instance, permanently — and most pages mount two instances (a page/section
 * cycler plus the footer's), so 14 full-viewport layers were alive at all
 * times. On a Retina MacBook that is ~24MB of backing store each — roughly
 * 350MB before the rest of the page is counted. WebKit answers that kind of
 * layer-tree pressure by evicting and re-rasterising layers mid-scroll, which
 * is precisely the scroll flicker Safari/iOS users reported. (The earlier
 * `[data-offscreen]` pause only stopped the ANIMATIONS — `will-change` kept
 * every layer and its texture resident, so it never addressed the memory.)
 *
 * The fix keeps the look and drops the cost:
 *   • at most TWO shades exist at a time — the outgoing one and the incoming
 *     one — and the outgoing is unmounted the moment the crossfade ends, so
 *     the steady state is a SINGLE layer;
 *   • the pan/zoom drift lives on one wrapper instead of on every shade, so
 *     the shades paint into that wrapper's layer rather than each owning one;
 *   • off-screen instances unmount their shades entirely, releasing the
 *     texture instead of merely pausing it;
 *   • the shade files are pre-decoded once, so a swap never waits on a
 *     network round-trip or a synchronous decode during scroll.
 * Net effect: 7-14 permanent full-viewport layers per page become 1-2.
 */

const SHADES = [1, 2, 3, 4, 5, 6, 7];
/** ms each shade holds before the next one starts fading in (7 x 3.5s = the
    original 24.5s loop). */
const HOLD_MS = 3500;
/** ms the crossfade itself takes; must match `--fade` in the CSS below. */
const FADE_MS = 1400;

export default function GradientCycler({
  fixed = false,
  className = "",
}: {
  fixed?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Starts live so the first shade is in the SERVER-rendered markup and paints
  // immediately — the gradient must never depend on hydration having run. The
  // observer below only ever turns it OFF, once the host has scrolled away.
  const [live, setLive] = useState(true);
  // `prev` is -1 whenever no crossfade is in flight (the single-layer state).
  const [{ cur, prev }, setSlot] = useState({ cur: 0, prev: -1 });

  useEffect(() => {
    if (fixed) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setLive(e.isIntersecting),
      // generous margin: come alive slightly BEFORE the section scrolls in so
      // the crossfade is already running when it becomes visible
      { rootMargin: "20% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fixed]);

  // Decode every shade once, off the critical path. Swapping the mounted
  // <img> then costs nothing — no decode stall on the scrolling main thread.
  useEffect(() => {
    const imgs = SHADES.map((i) => {
      const img = new Image();
      img.src = `/figma/gradients/shade-${i}.webp`;
      return img;
    });
    return () => imgs.forEach((img) => (img.src = ""));
  }, []);

  // advance the shade
  useEffect(() => {
    if (!live) return;
    const t = setInterval(
      () => setSlot((s) => ({ cur: (s.cur + 1) % SHADES.length, prev: s.cur })),
      HOLD_MS
    );
    return () => clearInterval(t);
  }, [live]);

  // crossfade finished → drop the outgoing layer, back to a single layer
  useEffect(() => {
    if (prev < 0) return;
    const t = setTimeout(() => setSlot((s) => ({ ...s, prev: -1 })), FADE_MS + 80);
    return () => clearTimeout(t);
  }, [prev]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`${fixed ? "fixed" : "absolute"} inset-0 -z-10 overflow-hidden pointer-events-none ${className}`}
    >
      {/* ONE drift layer holds the shades: the pan/zoom is composited once
          here instead of once per shade. Only mounted while live, so an
          off-screen instance holds no texture at all. */}
      {live ? (
        <div className="gradient-drift absolute inset-0">
          {/* outgoing shade — present only during a crossfade */}
          {prev >= 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`prev-${prev}`}
              src={`/figma/gradients/shade-${SHADES[prev]}.webp`}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          {/* incoming shade — fades up over the outgoing one. `key` forces a
              fresh element per shade so the CSS fade-in animation re-runs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`cur-${cur}`}
            src={`/figma/gradients/shade-${SHADES[cur]}.webp`}
            alt=""
            className={`absolute inset-0 size-full object-cover ${
              prev >= 0 ? "gradient-fade-in" : ""
            }`}
          />
        </div>
      ) : null}
    </div>
  );
}
