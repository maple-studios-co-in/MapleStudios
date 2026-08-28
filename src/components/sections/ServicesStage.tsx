"use client";

import { useRef } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import { SERVICES_DATA, WORK_DATA } from "@/lib/constants";

/**
 * The full-screen services stage, driven by an external 0..1 progress value.
 * It is the FINAL PANEL of the horizontal work track, and plays the trionn
 * sequence from the reference capture:
 *   0.00–0.18  the type arrives ON CREAM (maroon ink) via the horizontal slide
 *   0.18–0.34  the screen goes black and the particle film fades in — the
 *              type crossfades maroon → cream at the same time
 *   0.30–0.46  letters burst as the DNA helix forms
 *   0.46–0.98  glass service cards are GENERATED from the helix — spawn small
 *              at the centre, grow while revolving outward, dissolve — loop.
 */

const rnd = (i: number, salt: number) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Round helper — keeps SSR and client transform strings identical. */
const r2 = (n: number) => Math.round(n * 100) / 100;

function BurstLetter({
  progress,
  ch,
  index,
}: {
  progress: MotionValue<number>;
  ch: string;
  index: number;
}) {
  const j = r2(rnd(index, 7) * 0.05);
  const start = 0.3 + j;
  const end = 0.46 + j;
  const x = useTransform(progress, [start, end], ["0vw", `${r2((rnd(index, 1) - 0.5) * 130)}vw`]);
  const y = useTransform(progress, [start, end], ["0vh", `${r2((rnd(index, 2) - 0.5) * 110)}vh`]);
  const rotate = useTransform(progress, [start, end], [0, r2((rnd(index, 3) - 0.5) * 520)]);
  const opacity = useTransform(progress, [start, start + (end - start) * 0.75], [1, 0]);
  return (
    <motion.span
      style={{ x, y, rotate, opacity }}
      className="inline-block"
      suppressHydrationWarning
    >
      {ch}
    </motion.span>
  );
}

/** Spawn window and loop count for the card emission (one slow pass). */
const W0 = 0.46;
const W1 = 0.98;
const CYCLES = 1;

/** Per-card cycle position in [0,1), or null outside the emission window. */
const cyc = (p: number, index: number, total: number) => {
  const w = (p - W0) / (W1 - W0);
  if (w <= 0) return null;
  const n = Math.max(total, 1);
  return (Math.min(w, 0.999) * CYCLES + index / n) % 1;
};

function SpawnCard({
  progress,
  card,
  index,
  total,
}: {
  progress: MotionValue<number>;
  card: (typeof SERVICES_DATA.cards)[number];
  index: number;
  total: number;
}) {
  const base = -90 + index * (360 / Math.max(total, 1));

  const x = useTransform(progress, (p) => {
    const c = cyc(p, index, total);
    if (c === null) return "0vw";
    // Slower angular travel (~75°) + wider orbit so cards sit farther from DNA
    const a = ((base + c * 75) * Math.PI) / 180;
    const r = 12 + c * 30;
    return `${r2(Math.cos(a) * r)}vw`;
  });
  const y = useTransform(progress, (p) => {
    const c = cyc(p, index, total);
    if (c === null) return "0vh";
    const a = ((base + c * 75) * Math.PI) / 180;
    const r = 10 + c * 24;
    return `${r2(Math.sin(a) * r)}vh`;
  });
  const scale = useTransform(progress, (p) => {
    const c = cyc(p, index, total);
    return c === null ? 0.35 : r2(0.55 + c * 0.7); // grows toward ~1.25x
  });
  const opacity = useTransform(progress, (p) => {
    const c = cyc(p, index, total);
    if (c === null) return 0;
    if (c < 0.18) return r2(c / 0.18); // materialise from the helix
    if (c < 0.78) return 1; // hold near the DNA a touch longer
    return r2(Math.max(0, 1 - (c - 0.78) / 0.22)); // gentle dissolve
  });

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none">
      <motion.article
        style={{ x, y, opacity, scale }}
        className="w-[290px] rounded-[12px] border border-white/20 bg-[#2a0c0a]/55 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-[14px]"
        suppressHydrationWarning
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-sans-luxury text-[max(14px,0.926vw)] font-bold leading-normal text-white">
            {card.title}
          </h3>
          <Image
            src={card.icon}
            alt=""
            width={28}
            height={28}
            className="mt-0.5 size-7 shrink-0 object-contain"
          />
        </div>
        <p className="mt-2 font-sans-luxury text-[max(14px,0.926vw)] font-normal leading-normal text-white">
          <span className="font-bold">{card.lead}</span> {card.body}
        </p>
      </motion.article>
    </div>
  );
}

export default function ServicesStage({ progress }: { progress: MotionValue<number> }) {
  const scrubRef = useRef<HTMLVideoElement>(null);

  // sphere/ring while the type holds, helix forming through the burst,
  // slow crawl across the DNA during the emission phase
  const vidTime = useTransform(progress, [0, 0.3, 0.46, 1], [0.05, 2.3, 2.85, 3.55]);
  useMotionValueEvent(vidTime, "change", (t) => {
    const v = scrubRef.current;
    if (v && v.readyState >= 1 && Math.abs(v.currentTime - t) > 0.02) v.currentTime = t;
  });

  // The trionn reveal: cream stage → screen goes black → film fades in,
  // while the type ink crossfades maroon → cream.
  const blackOpacity = useTransform(progress, [0.18, 0.3], [0, 1]);
  const videoOpacity = useTransform(progress, [0.22, 0.34], [0, 1]);
  const ink = useTransform(progress, [0.18, 0.3], ["#741a14", "#fff3d3"]);
  const labelOpacity = useTransform(progress, [0.28, 0.36], [1, 0]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#fff3d3]">
      {/* darkness first, then the film on top of it */}
      <motion.div aria-hidden="true" style={{ opacity: blackOpacity }} className="absolute inset-0 bg-black" />
      <motion.video
        ref={scrubRef}
        style={{ opacity: videoOpacity }}
        className="absolute inset-0 size-full object-cover"
        src={SERVICES_DATA.video}
        muted
        playsInline
        preload="auto"
      />

      {/* Pinned type — arrives maroon-on-cream, turns cream as the screen
          darkens, then bursts per letter as the helix forms */}
      <motion.div style={{ color: ink }} className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.span
          style={{ opacity: labelOpacity }}
          className="font-sans-luxury text-[max(13px,1vw)] font-bold uppercase tracking-[0.2em]"
        >
          {WORK_DATA.servicesLabel}
        </motion.span>
        <div className="mt-6">
          {WORK_DATA.servicesLines.map((line, li) => (
            <h2
              key={line}
              className="font-serif-luxury text-[max(44px,7vw)] leading-[0.9]"
            >
              {line.split("").map((ch, ci) => (
                <BurstLetter key={`${li}-${ci}`} progress={progress} ch={ch} index={li * 20 + ci} />
              ))}
            </h2>
          ))}
        </div>
      </motion.div>

      {/* Glass service cards generated from / revolving around the DNA */}
      {SERVICES_DATA.cards.map((c, i) => (
        <SpawnCard
          key={c.id}
          progress={progress}
          card={c}
          index={i}
          total={SERVICES_DATA.cards.length}
        />
      ))}
    </div>
  );
}
