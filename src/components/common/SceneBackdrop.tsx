"use client";

import GradientCycler from "@/components/common/GradientCycler";

/**
 * ONE viewport-fixed maroon scene painted behind the hero, the About screen
 * and the marquee band. Because it is `fixed`, every section above Key Facts
 * shares the exact same pixels — a seam between them is impossible by
 * construction (per-section gradients could never line up: each restarted its
 * own radial, so the marquee's top edge never matched the hero's bottom).
 *
 * Sits at -z-10 inside <main>: it paints over main's flat background but
 * under all content, so the opaque cream sections (Key Facts onward) and the
 * strip-exit overlay cover it normally.
 */
export default function SceneBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "#5d1411",
          background:
            "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)",
        }}
      />
      {/* Auto-cycling gradient shades */}
      <GradientCycler />
      {/* Continuous breathing gradient — a lighter red that drifts and pulses */}
      <div
        className="hero-glow absolute inset-0"
        style={{
          background:
            "radial-gradient(48% 90% at 46% 55%, rgba(190,62,45,0.55) 0%, rgba(139,42,32,0.32) 42%, transparent 74%)",
        }}
      />
    </div>
  );
}
