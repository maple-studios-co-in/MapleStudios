"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * The hero badge's live stopwatch: starts at 0h 00m 00s when the page loads
 * and counts real time from there, so a refresh always resets it to zero.
 * Each changed digit rolls up behind its own mask (odometer, not a tick).
 *
 * Elapsed time is derived from a start timestamp rather than accumulated per
 * tick, so it stays exact even when the tab throttles timers in background.
 * Renders 0h 00m on the server AND on the first client render, so the markup
 * hydrates identically.
 */
function RollDigit({ char }: { char: string }) {
  // non-digits (the h/m/s letters and spaces) never animate — they'd jitter
  if (!/\d/.test(char)) {
    return <span className="inline-block">{char}</span>;
  }
  return (
    <span className="relative inline-block h-[1.35em] w-[0.6em] overflow-hidden align-bottom">
      <AnimatePresence initial={false}>
        <motion.span
          key={char}
          initial={{ y: "110%" }}
          animate={{ y: "0%" }}
          exit={{ y: "-110%" }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default function BuildTimer({ className = "" }: { className?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    // sub-second poll so the displayed second flips promptly after each
    // real second boundary, without a 1s interval slowly drifting off it
    const id = setInterval(
      () => setElapsed(Math.floor((performance.now() - started) / 1000)),
      200
    );
    return () => clearInterval(id);
  }, []);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor(elapsed / 60) % 60;
  const s = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${h}h ${pad(m)}m ${pad(s)}s`;

  return (
    <span className={`flex items-center tabular-nums ${className}`}>
      <span aria-hidden="true" className="flex items-center">
        {text.split("").map((c, i) => (
          <RollDigit key={i} char={c} />
        ))}
      </span>
      {/* screen readers get the plain figure, not the per-digit soup */}
      <span className="sr-only">{text}</span>
    </span>
  );
}
