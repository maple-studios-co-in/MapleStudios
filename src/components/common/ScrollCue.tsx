"use client";

import { motion } from "motion/react";

/**
 * Circular down-arrow used on heroes. Looks unchanged (same assets, same
 * 1.6s bob). Clicking it scrolls to the next page section — or, when the
 * cue lives inside a long sticky pin (`data-pin-scroll` on the host), to
 * that pin's next beat so the home hero actually advances.
 */
export function scrollToNextSection(from: HTMLElement) {
  const pin = from.closest<HTMLElement>("[data-pin-scroll]");
  if (pin) {
    const progress = Number(pin.dataset.pinScroll);
    const range = Math.max(0, pin.offsetHeight - window.innerHeight);
    const top = pin.getBoundingClientRect().top + window.scrollY + range * (Number.isFinite(progress) ? progress : 0.38);
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    return;
  }

  const root = from.closest("main") ?? document.body;
  const blocks = Array.from(root.querySelectorAll("section, footer")).filter(
    (el) => !el.parentElement?.closest("section")
  );
  const current = from.closest("section");
  const idx = current ? blocks.indexOf(current) : -1;
  const next =
    idx >= 0
      ? blocks[idx + 1]
      : blocks.find((el) => el.getBoundingClientRect().top > 48);

  if (!(next instanceof HTMLElement)) return;

  const header = document.querySelector("header");
  const offset = (header instanceof HTMLElement ? header.getBoundingClientRect().height : 0) + 8;
  const top = next.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export default function ScrollCue({
  className = "",
  delay = 0.8,
  duration = 0.8,
  cream = false,
}: {
  className?: string;
  delay?: number;
  duration?: number;
  cream?: boolean;
}) {
  return (
    <motion.button
      type="button"
      aria-label="Scroll to next section"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        scrollToNextSection(e.currentTarget);
      }}
      className={`pointer-events-auto cursor-pointer border-0 bg-transparent p-0 before:absolute before:-inset-4 before:content-[''] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cream ? "/figma/about/scroll-circle-maroon.svg" : "/figma/scroll-circle.svg"}
        alt=""
        className="absolute inset-0 size-full"
      />
      <motion.span
        animate={{ y: [0, 3.5, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/figma/arrow-down-sm.svg"
          alt=""
          className={`w-[max(7.8px,0.516vw)] rotate-90 ${
            cream ? "[filter:invert(13%)_sepia(72%)_saturate(3200%)_hue-rotate(350deg)]" : ""
          }`}
        />
      </motion.span>
    </motion.button>
  );
}
