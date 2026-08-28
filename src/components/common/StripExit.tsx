"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
/**
 * trionn.com section exit: the OUTGOING section's own last screen pins — its
 * real content stays visible — while cream strips grow over it in an organic
 * order until the screen is solid cream, then it releases into the cream
 * section below (which overlaps the finished tail by -60vh).
 *
 * Works for BOTH section sizes:
 *  • taller than the viewport → pin-at-END via sticky `top: 100vh - height`,
 *    strip overlay aligned to the LAST screen (bottom-0);
 *  • shorter than the viewport (e.g. the compact marquee band) → pins at the
 *    TOP (top: 0), overlay aligned to the pinned viewport (top-0), and the
 *    scroll progress is remapped so strips only start once the pin engages.
 */
const APPEAR_ORDER = [6, 2, 9, 4, 0, 7, 3, 8, 1, 5];

/**
 * Scroll consumed while the section stays pinned, in viewport heights.
 *
 * Keep this only a little longer than the strip run itself (STRIP_DONE
 * below): runway left over AFTER the strips finish is dead pinned scroll,
 * and the next section has to overlap ALL of it with a negative margin to
 * avoid a blank cream screen. Push it too far and that margin exceeds the
 * remaining page height — the last section then ends before the container
 * does and the leftover runway shows below the footer.
 *
 * Pace lives in STRIP_DONE, not here.
 */
export const RUNWAY_VH = 150;
/** Fraction of the runway over which the strips grow — 0.72 x 150vh = 108vh
    of scroll, 3x the original 36vh run. THE pacing knob. */
const STRIP_DONE = 0.72;
/** Fraction of the runway that elapses before the pin engages, for a section
    of `ratio` viewport-heights (a short band pins later than a tall one). */
const pinOffset = (ratio: number) =>
  Math.max(0, 1 - Math.min(ratio, 1)) / (RUNWAY_VH / 100);

function Strip({
  progress,
  index,
  total,
  color,
}: {
  progress: MotionValue<number>;
  index: number;
  total: number;
  color: string;
}) {
  // Scattered start times spread over 4/7 of the run, each strip taking the
  // remaining 3/7 — so the last one lands exactly on STRIP_DONE.
  const order = APPEAR_ORDER[index % APPEAR_ORDER.length] % total;
  const start = (order / total) * STRIP_DONE * (4 / 7);
  const scaleY = useTransform(
    progress,
    [start, start + STRIP_DONE * (3 / 7)],
    [0, 1.03]
  );
  return (
    <motion.div
      style={{
        top: `${(index / total) * 100}%`,
        height: `${100 / total + 0.4}%`,
        scaleY,
        background: color,
      }}
      // pointer-events-auto: the strips themselves must stay hit-testable so
      // the adaptive navbar can sense the cream background under it via
      // elementsFromPoint (which skips pointer-transparent nodes)
      //
      // NO will-change here. Each StripExit renders 10-24 of these and a page
      // mounts several, so a permanent `will-change: transform` pinned ~95
      // composited layers on the home page alone — WebKit evicts and
      // re-rasterizes under that pressure, which reads as scroll flicker.
      // These are flat solid-colour rects: repainting one is trivial, and the
      // browser still promotes them on its own while the transform is
      // actually animating.
      className="pointer-events-auto absolute inset-x-0 origin-center"
    />
  );
}

export default function StripExit({
  children,
  bands = 10,
  className = "",
  /** Strip colour — match the section that comes NEXT, so when the cover
      completes the screen already IS that section's ground and it slides up
      seamlessly (cream by default; the contact hero hands off to maroon). */
  color = "#fff3d3",
}: {
  children: React.ReactNode;
  bands?: number;
  className?: string;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<{ top: number | null; ratio: number }>({
    top: null,
    ratio: 1,
  });

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () =>
      setM({
        top: Math.min(0, window.innerHeight - el.offsetHeight),
        ratio: el.offsetHeight / window.innerHeight,
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // The progress window spans exactly the runway. For tall sections the pin
  // starts at its opening edge; for short ones it starts later — remap so
  // strip progress stays 0 until then.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: [`end ${1 + RUNWAY_VH / 100}`, "end 1"],
  });
  const ratio = m.ratio;
  const pinStart = useTransform(scrollYProgress, (p) => {
    const p0 = pinOffset(ratio);
    return p <= p0 ? 0 : (p - p0) / (1 - p0);
  });
  // Slow, heavy spring (premium pacing): the strips glide rather than snap
  const smooth = useSpring(pinStart, {
    stiffness: 22,
    damping: 13,
    restDelta: 0.001,
  });

  const short = m.top === 0;
  // Short mode: the overlay must span section + ENTIRE runway (not just one
  // screen) — otherwise a strip of bare page background shows between the
  // overlay's end and the overlapping next section after release. Band COUNT
  // scales with that height so each strip keeps its designed thickness
  // (16 bands were sized for a 1.2-viewport runway).
  const bandCount = short
    ? Math.max(16, Math.round(((ratio + RUNWAY_VH / 100) / (ratio + 1.2)) * 16))
    : bands;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        style={m.top === null ? undefined : { position: "sticky", top: m.top }}
      >
        <div ref={innerRef} className="relative isolate">
          {children}
          {/* Strip overlay covering the pinned screen. The CONTAINER is
              pass-through — it paints nothing, and while it was hit-testable
              it swallowed every hover over the section beneath (the marquee
              could never pause). Its strips opt back in individually, so the
              navbar's elementsFromPoint background probe still sees them. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 z-10 overflow-hidden ${
              short ? "top-0" : "bottom-0 h-screen"
            }`}
            style={short ? { height: `calc(100% + ${RUNWAY_VH}vh)` } : undefined}
          >
            {Array.from({ length: bandCount }, (_, i) => (
              <Strip key={i} progress={smooth} index={i} total={bandCount} color={color} />
            ))}
          </div>
        </div>
      </div>
      {/* Runway consumed while the section stays pinned */}
      <div aria-hidden="true" style={{ height: `${RUNWAY_VH}vh` }} />
    </div>
  );
}
