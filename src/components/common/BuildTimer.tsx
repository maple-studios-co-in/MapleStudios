"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";

/**
 * The hero badge's count-up: the readout climbs from 0h 00m to the real
 * average — 22h 40m — the first time the badge scrolls into view,
 * decelerating on a cubic ease-out so the final digits click into place
 * (a stat reveal, not a live stopwatch; seconds intentionally not shown).
 * Plays once per page load. Each changed digit rolls up behind its own
 * mask (odometer, not a tick).
 *
 * The climb is quantized into STEPS eased checkpoints, one per roll: a digit
 * is re-keyed at most once per step, and each roll (0.36s) finishes inside
 * its step window (0.4s). The earlier 40ms free-running poll re-keyed every
 * digit dozens of times mid-roll — AnimatePresence piled up hundreds of
 * overlapping enter/exit spans, the main thread choked, and slots sat blank
 * (each incoming char was replaced before it ever climbed into view), which
 * is why the card lagged and showed a lone digit.
 *
 * Renders 0h 00m on the server AND on the first client render, so the
 * markup hydrates identically.
 */

// 22h 40m — avg. time to first live build
const TARGET_SECONDS = 22 * 3600 + 40 * 60;
const COUNT_MS = 2800;
const STEPS = 7;
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
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default function BuildTimer({
  className = "",
  format = "hm",
}: {
  className?: string;
  format?: "hm" | "colon";
}) {
  const [elapsed, setElapsed] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.6 });

  useEffect(() => {
    if (!inView) return;
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      const eased = 1 - Math.pow(1 - step / STEPS, 3); // cubic ease-out
      setElapsed(Math.round(TARGET_SECONDS * eased));
      if (step >= STEPS) clearInterval(id);
    }, COUNT_MS / STEPS);
    return () => clearInterval(id);
  }, [inView]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor(elapsed / 60) % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = format === "colon" ? `${pad(h)} : ${pad(m)}` : `${h}h:${pad(m)}m`;

  return (
    <span ref={rootRef} className={`flex items-center tabular-nums ${className}`}>
      <span aria-hidden="true" className="flex items-center justify-center">
        {text.split("").map((c, i) => (
          <RollDigit key={i} char={c} />
        ))}
      </span>
      {/* screen readers get the plain figure, not the per-digit soup */}
      <span className="sr-only">{text}</span>
    </span>
  );
}
