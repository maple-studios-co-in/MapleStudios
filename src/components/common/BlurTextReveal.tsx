"use client";

import { useMemo, useState } from "react";
import { motion, type Variants } from "motion/react";

/**
 * trionn.com's BlurTextReveal, ported from their shipped bundle (GSAP
 * SplitText + timeline there; motion/react variants here — same numbers).
 *
 * Their recipe, kept verbatim: the container AND every unit start at
 * opacity 0 / blur(12px); the container sharpens over 0.5s while each unit
 * sharpens over 0.8s, staggered 0.05s apart in RANDOM order (their stagger
 * is {each:.05, from:"random"} — the scattered un-blur is the signature),
 * everything on power2.out (cubic), triggered when the block reaches the
 * bottom ~10% of the viewport, playing once. Their paragraphs split by
 * WORDS; their headings split by CHARS (animationType:"chars") — `mode`
 * picks the unit. Chars stay wrapped in whitespace-nowrap word boxes so
 * line wrapping still happens at word boundaries.
 *
 * The random order must be identical on server and client (repo rule:
 * deterministic randomness only — hydration), so it comes from a seeded
 * LCG shuffle, not Math.random.
 *
 * After the cascade the animated spans are swapped for PLAIN text nodes —
 * trionn does the same (willChange:"auto", filter:"none" on complete).
 * Leaving dozens of spans with live blur filters + will-change keeps that
 * many composited layers alive for the page's lifetime, which shimmers on
 * weaker GPUs.
 */

const EASE_OUT_CUBIC: [number, number, number, number] = [0.215, 0.61, 0.355, 1];

function seededShuffle(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = 190841; // fixed seed — same cascade every load, SSR-safe
  const rand = () => (s = (s * 48271) % 2147483647) / 2147483647;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const TAGS = {
  p: motion.p,
  span: motion.span,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
} as const;

export default function BlurTextReveal({
  text,
  as = "p",
  mode = "words",
  className = "",
  style,
  stagger = 0.05,
  duration = 0.8,
  delay = 0,
}: {
  text: string;
  as?: keyof typeof TAGS;
  /** split unit — trionn: "words" for paragraphs, "chars" for headings */
  mode?: "words" | "chars";
  className?: string;
  style?: React.CSSProperties;
  /** seconds between one unit sharpening and the next (trionn: 0.05) */
  stagger?: number;
  /** seconds each unit takes to sharpen (trionn: 0.8) */
  duration?: number;
  delay?: number;
}) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const unitCount = useMemo(
    () => (mode === "chars" ? words.reduce((n, w) => n + w.length, 0) : words.length),
    [mode, words]
  );
  const order = useMemo(() => seededShuffle(unitCount), [unitCount]);
  // the unit whose stagger slot is LAST — its completion ends the cascade
  const lastIdx = useMemo(() => order.indexOf(unitCount - 1), [order, unitCount]);
  const [done, setDone] = useState(false);

  const container: Variants = {
    hidden: { opacity: 0, filter: "blur(12px)" },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      transition: { duration: 0.5, delay, ease: EASE_OUT_CUBIC },
    },
  };
  const unit: Variants = {
    hidden: { opacity: 0, filter: "blur(12px)" },
    visible: (k: number) => ({
      opacity: 1,
      filter: "blur(0px)",
      transition: { duration, delay: delay + k * stagger, ease: EASE_OUT_CUBIC },
    }),
  };

  const Tag = TAGS[as];

  // cascade finished: plain markup, zero filters, zero composited layers
  if (done) {
    const Plain = as;
    return <Plain className={className} style={style}>{text}</Plain>;
  }

  const animatedSpan = (content: string, unitIdx: number, key: React.Key) => (
    <motion.span
      key={key}
      aria-hidden
      custom={order[unitIdx]}
      variants={unit}
      className="inline-block will-change-[filter,opacity]"
      onAnimationComplete={
        unitIdx === lastIdx ? (def) => def === "visible" && setDone(true) : undefined
      }
    >
      {content}
    </motion.span>
  );

  // inter-word spaces live BETWEEN the animated spans (plain text nodes),
  // never inside: trailing whitespace inside an inline-block collapses
  // and the words would run together
  const children: React.ReactNode[] = [];
  let unitIdx = 0;
  words.forEach((w, wi) => {
    if (mode === "chars") {
      children.push(
        // nowrap word box so the line still breaks at word boundaries
        <span key={wi} className="whitespace-nowrap">
          {[...w].map((ch, ci) => animatedSpan(ch, unitIdx++, ci))}
        </span>
      );
    } else {
      children.push(animatedSpan(w, unitIdx++, wi));
    }
    if (wi < words.length - 1) children.push(" ");
  });

  return (
    <Tag
      className={className}
      style={style}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      aria-label={text}
    >
      {children}
    </Tag>
  );
}
