"use client";

import { useEffect, useRef } from "react";

/**
 * Auto-cycling reddish gradient — the 7 supplied shades (Default → Variant7)
 * crossfade sequentially on a 24.5s `.gradient-cycle` loop (3.5s per shade)
 * while each pans/zooms, so the light keeps travelling. Host element needs
 * `relative isolate` (the cycler sits at -z-10, below the host's content but
 * above its background). `fixed` renders viewport-locked for whole-page use.
 *
 * Safari/iOS: every instance is 7 full-viewport composited layers running
 * two infinite animations each — and instances kept animating after being
 * scrolled out of view. That off-screen compositor churn (plus WebKit's
 * negative-z repaint quirks) is what flickered scrolls on iOS/macOS, so the
 * stack now pauses itself whenever the host leaves the viewport
 * ([data-offscreen] rule in globals.css) and the container is promoted to
 * its own stable layer (transform-gpu) to isolate the -z-10 stack.
 */
export default function GradientCycler({
  fixed = false,
  className = "",
}: {
  fixed?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    // viewport-locked use never leaves view — nothing to pause
    if (!el || fixed) return;
    const io = new IntersectionObserver(
      ([e]) => el.toggleAttribute("data-offscreen", !e.isIntersecting),
      // generous margin: resume slightly BEFORE the section scrolls in, so
      // the crossfade is already live when it becomes visible
      { rootMargin: "20% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fixed]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`${fixed ? "fixed" : "absolute"} inset-0 -z-10 transform-gpu overflow-hidden pointer-events-none ${className}`}
    >
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={`/figma/gradients/shade-${i}.webp`}
          alt=""
          className="gradient-cycle absolute inset-0 size-full object-cover"
          style={{ animationDelay: `${(i - 1) * 3.5}s` }}
        />
      ))}
    </div>
  );
}
