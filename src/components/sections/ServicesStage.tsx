"use client";

import { useRef } from "react";
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
 *   0.46–0.98  cards are GENERATED from the helix — spawn small at the centre,
 *              grow while revolving outward, dissolve — on a slow loop.
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
      className="inline-block will-change-transform"
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
const cyc = (p: number, index: number) => {
  const w = (p - W0) / (W1 - W0);
  if (w <= 0) return null;
  return (Math.min(w, 0.999) * CYCLES + index / 4) % 1;
};

function SpawnCard({
  progress,
  card,
  index,
}: {
  progress: MotionValue<number>;
  card: (typeof SERVICES_DATA.cards)[number];
  index: number;
}) {
  const base = -90 + index * 90;

  const x = useTransform(progress, (p) => {
    const c = cyc(p, index);
    if (c === null) return "0vw";
    const a = ((base + c * 130) * Math.PI) / 180;
    const r = 6 + c * 26;
    return `${r2(Math.cos(a) * r)}vw`;
  });
  const y = useTransform(progress, (p) => {
    const c = cyc(p, index);
    if (c === null) return "0vh";
    const a = ((base + c * 130) * Math.PI) / 180;
    const r = 5 + c * 21;
    return `${r2(Math.sin(a) * r)}vh`;
  });
  const scale = useTransform(progress, (p) => {
    const c = cyc(p, index);
    return c === null ? 0.35 : r2(0.55 + c * 1.05); // grows to ~1.6x
  });
  const opacity = useTransform(progress, (p) => {
    const c = cyc(p, index);
    if (c === null) return 0;
    if (c < 0.2) return r2(c / 0.2); // slower materialise
    if (c < 0.68) return 1;
    return r2(Math.max(0, 1 - (c - 0.68) / 0.32)); // gentler dissolve
  });

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <motion.article
        style={{ x, y, opacity, scale }}
        className="min-h-[clamp(102px,9vw,141px)] w-[clamp(260px,23vw,360px)] rounded-[8px] border border-white/10 bg-black/35 p-5 backdrop-blur-[5px] will-change-transform"
        suppressHydrationWarning
      >
        <h3 className="font-sans-luxury text-[clamp(15px,1.15vw,18px)] font-bold leading-[1.15] text-[#fff3d3]">
          {card.titleLines.join(" ")}
        </h3>
        <p className="mt-2 font-sans-luxury text-[12px] leading-snug text-white/85">
          <span className="font-bold text-white">{card.lead}</span>
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
          className="font-sans-luxury text-[clamp(13px,1vw,16px)] font-bold uppercase tracking-[0.2em]"
        >
          {WORK_DATA.servicesLabel}
        </motion.span>
        <div className="mt-6">
          {WORK_DATA.servicesLines.map((line, li) => (
            <h2
              key={line}
              className="font-serif-luxury text-[clamp(44px,7vw,112px)] leading-[0.9]"
            >
              {line.split("").map((ch, ci) => (
                <BurstLetter key={`${li}-${ci}`} progress={progress} ch={ch} index={li * 20 + ci} />
              ))}
            </h2>
          ))}
        </div>
      </motion.div>

      {/* Cards generated from the DNA */}
      {SERVICES_DATA.cards.map((c, i) => (
        <SpawnCard key={c.id} progress={progress} card={c} index={i} />
      ))}
    </div>
  );
}
