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
 * trionn.com section exit, per the reference capture: the OUTGOING section's
 * own last screen pins — its real content (e.g. the marquee) stays visible —
 * while cream strips grow over it in an organic order until the screen is
 * solid cream, then it releases into the cream section below. No reserved
 * empty block: the transition happens on top of live content.
 *
 * Pin-at-END mechanics: `sticky bottom-0` would pin at the START of
 * visibility (footer-reveal semantics), so instead the section gets
 * `position: sticky; top: calc(100vh - height)` — it scrolls normally until
 * its bottom reaches the viewport bottom, then holds for the 100vh runway
 * spacer that follows. Height is measured and kept fresh via ResizeObserver.
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
  const order = APPEAR_ORDER[index % APPEAR_ORDER.length] % total;
  const start = (order / total) * 0.55;
  const scaleY = useTransform(progress, [start, start + 0.45], [0, 1.03]);
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
}: {
  children: React.ReactNode;
  bands?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [stickTop, setStickTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () =>
      setStickTop(Math.min(0, window.innerHeight - el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // 120vh runway: deliberate but without a long blank tail after completion;
  // the spring interpolates between scroll events so strips glide, not step.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["end 2.2", "end 1"],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 70,
    damping: 22,
    restDelta: 0.001,
  });

  return (
    <div ref={ref} className="relative">
      <div
        style={stickTop === null ? undefined : { position: "sticky", top: stickTop }}
      >
        <div ref={innerRef} className="relative">
          {children}
          {/* Strip overlay covering the pinned (last) screen of the section */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-screen overflow-hidden"
          >
            {Array.from({ length: bands }, (_, i) => (
              <Strip key={i} progress={smooth} index={i} total={bands} />
            ))}
          </div>
        </div>
      </div>
      {/* Runway consumed while the section stays pinned */}
      <div aria-hidden="true" className="h-[120vh]" />
    </div>
  );
}
