"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

/* The WebGL scene ships only to browsers (three.js has no SSR story) and only
   once this wrapper mounts — the services route stays light until then. */
const OrbitScene = dynamic(() => import("./OrbitScene"), { ssr: false });

/**
 * Trionn-style 3D orbit around "Area of expertise" — thin wrapper that owns
 * placement + lifecycle; the three.js scene itself lives in OrbitScene.
 *
 *   • Sized to the hero's upper (cream-on-maroon) region only, so the GPU
 *     never rasterises canvas hidden under the lower band.
 *   • IntersectionObserver parks the render loop when the hero is offscreen.
 *   • activeNodeIndex ties the discipline list's hover to its orbiting relic.
 */
export default function ServicesOrbit({
  className = "",
  activeNodeIndex = null,
}: {
  className?: string;
  activeNodeIndex?: number | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The hero is the top of the page, so the scene mounts with it; the WebGL
  // context then lives for the page's life. IntersectionObserver only PAUSES
  // the render loop once the hero scrolls away (re-creating contexts on
  // scroll would thrash).
  const [mounted, setMounted] = useState(false);
  const [inView, setInView] = useState(true);
  // Disassemble driver (trionn's services orbit): 0 = assembled ring at page
  // top, 1 = relics scattered to the screen periphery. Completes by ~0.55
  // viewports — on desktop the intro statement rides up early, and the
  // relics must reach the edges before its copy is front-and-centre. Read
  // per-frame inside the scene (ref, not state — no React re-renders).
  const scatterRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => {
      const vh = window.innerHeight || 1;
      scatterRef.current = Math.min(1, Math.max(0, window.scrollY / (0.55 * vh)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const host = hostRef.current;
    if (!host) {
      return () => window.removeEventListener("scroll", onScroll);
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      rootMargin: "80px 0px",
    });
    io.observe(host);
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    // Spans the WHOLE hero; the inner sticky screen keeps the canvas on
    // screen while the intro/marquee screens scroll by — trionn pins their
    // orbit canvas the same way (theirs is position:fixed behind the first
    // sections). The hero section must NOT be overflow-hidden or the sticky
    // never engages.
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
    >
      <div className="sticky top-0 h-svh">
        {mounted ? (
          <OrbitScene activeNodeIndex={activeNodeIndex} running={inView} scatter={scatterRef} />
        ) : null}
      </div>
    </div>
  );
}
