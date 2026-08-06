"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";

/**
 * Word-by-word scroll-linked reveal: each word fades from 12% to full opacity
 * across its own slice of the container's scroll progress, so the sentence
 * "lights up" left-to-right while you scroll.
 */
function Word({
  progress,
  range,
  children,
}: {
  progress: MotionValue<number>;
  range: [number, number];
  children: string;
}) {
  const opacity = useTransform(progress, range, [0.12, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {children}
    </motion.span>
  );
}

export default function ScrollFadeText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  // Long window (90% → 10% of the viewport) = slow reveal across most of the scroll
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "start 0.1"],
  });
  const words = text.split(" ");

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => {
        const start = (i / words.length) * 0.7;
        return (
          <span key={`${word}-${i}`}>
            {/* wide, overlapping slices so neighbouring words blend smoothly */}
            <Word progress={scrollYProgress} range={[start, start + 0.3]}>
              {word}
            </Word>{" "}
          </span>
        );
      })}
    </p>
  );
}
