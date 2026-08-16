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

  useEffect(() => {
    setMounted(true);
    const host = hostRef.current;
    if (!host) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      rootMargin: "80px 0px",
    });
    io.observe(host);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 z-0 h-[max(420px,min(52vw,100svh))] ${className}`}
    >
      {mounted ? <OrbitScene activeNodeIndex={activeNodeIndex} running={inView} /> : null}
    </div>
  );
}
