"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import GradientCycler from "@/components/common/GradientCycler";

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

function Strip({
  progress,
  index,
  total,
}: {
  progress: MotionValue<number>;
  index: number;
  total: number;
}) {
  // all strips complete by progress 0.30 so the (deeper-overlapping) next
  // section never covers a mid-animation strip
  const order = APPEAR_ORDER[index % APPEAR_ORDER.length] % total;
  const start = (order / total) * 0.17;
  const scaleY = useTransform(progress, [start, start + 0.13], [0, 1.03]);
  return (
    <motion.div
      style={{
        top: `${(index / total) * 100}%`,
        height: `${100 / total + 0.4}%`,
        scaleY,
      }}
      className="absolute inset-x-0 origin-center bg-[#fff3d3] will-change-transform"
    />
  );
}

export default function StripExit({
  children,
  bands = 10,
  className = "",
  backdrop = false,
}: {
  children: React.ReactNode;
  bands?: number;
  className?: string;
  /** Paint ONE continuous hero-style backdrop (radial + cycling shades)
      across the section AND its full runway — for short sections whose
      runway would otherwise expose the flat page background. */
  backdrop?: boolean;
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

  // 120vh runway. For tall sections the pin starts exactly at ["end 2.2"];
  // for short ones it starts later — remap so strip progress is 0 until then.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["end 2.2", "end 1"],
  });
  const ratio = m.ratio;
  const pinStart = useTransform(scrollYProgress, (p) => {
    const p0 = Math.max(0, 1 - Math.min(ratio, 1)) / 1.2;
    return p <= p0 ? 0 : (p - p0) / (1 - p0);
  });
  const smooth = useSpring(pinStart, {
    stiffness: 70,
    damping: 22,
    restDelta: 0.001,
  });

  const short = m.top === 0;
  // Short mode: the overlay must span section + ENTIRE runway (not just one
  // screen) — otherwise a strip of bare page background shows between the
  // overlay's end and the overlapping next section after release.
  const bandCount = short ? 16 : bands;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        style={m.top === null ? undefined : { position: "sticky", top: m.top }}
      >
        <div ref={innerRef} className="relative isolate">
          {backdrop ? (
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 -z-10 isolate overflow-hidden"
              style={{
                height: "calc(100% + 120vh)",
                background:
                  "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)",
              }}
            >
              <GradientCycler />
            </div>
          ) : null}
          {children}
          {/* Strip overlay covering the pinned screen. NOT pointer-events-none:
              the adaptive navbar senses background via elementsFromPoint, which
              skips pointer-transparent nodes. */}
          <div
            aria-hidden="true"
            className={`absolute inset-x-0 z-10 overflow-hidden ${
              short ? "top-0" : "bottom-0 h-screen"
            }`}
            style={short ? { height: "calc(100% + 120vh)" } : undefined}
          >
            {Array.from({ length: bandCount }, (_, i) => (
              <Strip key={i} progress={smooth} index={i} total={bandCount} />
            ))}
          </div>
        </div>
      </div>
      {/* Runway consumed while the section stays pinned */}
      <div aria-hidden="true" className="h-[120vh]" />
    </div>
  );
}
