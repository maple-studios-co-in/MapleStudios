"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { RotateCcw } from "lucide-react";
import { SERVICES_DATA, WORK_DATA } from "@/lib/constants";

/**
 * The trionn-style pinned services sequence (from the AiSec reference):
 *  1. "A.I. DESIGN DEVELOPMENT BRANDING" pinned centre-screen in cream while
 *     the particle film plays behind it (scroll-SCRUBBED, not time-based, so
 *     the whole sequence is deterministic and reversible);
 *  2. as the DNA helix forms (~2.9s into the film) the letters BURST — each
 *     glyph flies out on its own deterministic trajectory with spin;
 *  3. the four service cards then sweep around the helix like the floating
 *     stat cards in the reference film;
 *  4. StripExit (wrapping this section in page.tsx) pins the final screen and
 *     dissolves it into Client stories.
 *
 * The video is encoded with a keyframe every 5 frames so currentTime seeks
 * resolve fast enough for smooth scrubbing.
 */

/** Deterministic pseudo-random in [0,1) — SSR-safe, stable per index. */
const rnd = (i: number, salt: number) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function BurstLetter({
  progress,
  ch,
  index,
}: {
  progress: MotionValue<number>;
  ch: string;
  index: number;
}) {
  const j = rnd(index, 7) * 0.05;
  const start = 0.3 + j;
  const end = 0.46 + j;
  const x = useTransform(progress, [start, end], ["0vw", `${((rnd(index, 1) - 0.5) * 130).toFixed(1)}vw`]);
  const y = useTransform(progress, [start, end], ["0vh", `${((rnd(index, 2) - 0.5) * 110).toFixed(1)}vh`]);
  const rotate = useTransform(progress, [start, end], [0, (rnd(index, 3) - 0.5) * 520]);
  const opacity = useTransform(progress, [start, start + (end - start) * 0.75], [1, 0]);
  return (
    <motion.span style={{ x, y, rotate, opacity }} className="inline-block will-change-transform">
      {ch}
    </motion.span>
  );
}

function OrbitCard({
  progress,
  card,
  index,
}: {
  progress: MotionValue<number>;
  card: (typeof SERVICES_DATA.cards)[number];
  index: number;
}) {
  // Four cards spaced 90° apart, sweeping 180° around the helix.
  const base = -90 + index * 90;
  const angle = useTransform(progress, [0.46, 0.96], [base - 30, base + 150]);
  const x = useTransform(angle, (a) => `${(Math.cos((a * Math.PI) / 180) * 31).toFixed(2)}vw`);
  const y = useTransform(angle, (a) => `${(Math.sin((a * Math.PI) / 180) * 25).toFixed(2)}vh`);
  const opacity = useTransform(progress, [0.46, 0.53], [0, 1]);
  const scale = useTransform(progress, [0.46, 0.56], [0.82, 1]);

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <motion.article
        style={{ x, y, opacity, scale }}
        className="w-[clamp(220px,19vw,290px)] rounded-[8px] border border-white/10 bg-black/35 p-5 backdrop-blur-[5px] will-change-transform"
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

export default function ServicesVideoSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const scrubRef = useRef<HTMLVideoElement>(null);
  const mobileRef = useRef<HTMLVideoElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 60, damping: 20, restDelta: 0.0005 });

  // Piecewise time map for new-era-sphere.mp4: sphere/ring/vase while the type
  // holds, the helix forming through the burst (~2.85s), then a slow crawl
  // across the fully-formed DNA (helix lives ~2.7-3.6s) while the cards orbit.
  const vidTime = useTransform(smooth, [0, 0.3, 0.46, 1], [0.05, 2.3, 2.85, 3.55]);
  useMotionValueEvent(vidTime, "change", (t) => {
    const v = scrubRef.current;
    if (v && v.readyState >= 1 && Math.abs(v.currentTime - t) > 0.02) v.currentTime = t;
  });

  // Mobile video: play only while the section is near the viewport.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const mv = mobileRef.current;
        if (!mv) return;
        if (entry.isIntersecting) void mv.play().catch(() => {});
        else mv.pause();
      },
      { rootMargin: "25% 0px" }
    );
    io.observe(section);
    return () => io.disconnect();
  }, []);

  const labelOpacity = useTransform(smooth, [0.28, 0.36], [1, 0]);

  const replayMobile = () => {
    const v = mobileRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play();
  };

  return (
    // no overflow-hidden here — the inner pin and StripExit's pin need it clear
    <section ref={sectionRef} id="services" className="relative bg-[#0a0202] text-white">
      {/* ——— Desktop: pinned scrub sequence ——— */}
      <div className="relative hidden h-[420vh] lg:block">
        <div className="sticky top-0 h-screen overflow-hidden">
          <video
            ref={scrubRef}
            className="absolute inset-0 size-full object-cover"
            src={SERVICES_DATA.video}
            muted
            playsInline
            preload="auto"
          />
          {/* soft vignette for type legibility */}
          <div aria-hidden="true" className="absolute inset-0 bg-black/25" />

          {/* Pinned type — bursts per letter as the helix forms */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <motion.span
              style={{ opacity: labelOpacity }}
              className="font-sans-luxury text-[clamp(13px,1vw,16px)] font-bold uppercase tracking-[0.2em] text-[#fff3d3]/90"
            >
              {WORK_DATA.servicesLabel}
            </motion.span>
            <div className="mt-6">
              {WORK_DATA.servicesLines.map((line, li) => (
                <h2
                  key={line}
                  className="font-serif-luxury text-[clamp(44px,7vw,112px)] leading-[0.9] text-[#fff3d3]"
                >
                  {line.split("").map((ch, ci) => (
                    <BurstLetter key={`${li}-${ci}`} progress={smooth} ch={ch} index={li * 20 + ci} />
                  ))}
                </h2>
              ))}
            </div>
          </div>

          {/* Cards sweeping around the helix */}
          {SERVICES_DATA.cards.map((c, i) => (
            <OrbitCard key={c.id} progress={smooth} card={c} index={i} />
          ))}
        </div>
      </div>

      {/* ——— Mobile / tablet: type + stacked cards over the playing film ——— */}
      <div className="relative lg:hidden">
        <video
          ref={mobileRef}
          className="absolute inset-0 size-full object-cover"
          src={SERVICES_DATA.video}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-black/35" />
        <div className="relative flex flex-col gap-8 px-5 py-16">
          <div className="text-center">
            <span className="font-sans-luxury text-[13px] font-bold uppercase tracking-[0.2em] text-[#fff3d3]/90">
              {WORK_DATA.servicesLabel}
            </span>
            <div className="mt-4">
              {WORK_DATA.servicesLines.map((line) => (
                <p key={line} className="font-serif-luxury text-[13vw] leading-[0.9] text-[#fff3d3]">
                  {line}
                </p>
              ))}
            </div>
          </div>
          {SERVICES_DATA.cards.map((card) => (
            <article
              key={card.id}
              className="flex flex-col gap-4 rounded-[8px] border border-white/10 bg-black/35 p-6 backdrop-blur-[4px]"
            >
              <h3 className="font-sans-luxury text-[22px] font-bold leading-[1.13] text-[#fff3d3]">
                {card.titleLines.join(" ")}
              </h3>
              <p className="font-sans-luxury text-[13px] leading-normal text-white/90">
                <span className="font-bold text-white">{card.lead}</span>
                <br />
                {card.body}
              </p>
            </article>
          ))}
          <button
            type="button"
            onClick={replayMobile}
            aria-label="Replay background video"
            className="mx-auto mt-2 flex size-[52px] items-center justify-center rounded-full border border-white/15 bg-black/60 backdrop-blur-md"
          >
            <RotateCcw className="size-[42%] text-white" strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </section>
  );
}
