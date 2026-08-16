"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ABOUT_PAGE } from "@/lib/constants";
import { Eyebrow, Reveal, Rule, UnderlineLink } from "../PageKit";
import { Star4, WordMarquee } from "../services/ServicesBody";
import EagleLive from "@/components/common/EagleLive";
import BlurTextReveal from "@/components/common/BlurTextReveal";
import { FounderSection, TeamSection } from "./FounderTeam";

/**
 * About hero — Figma 22:625 on a 128svh stage (taller than one viewport
 * so the eagle reads large): CREAM canvas, Catilde 60 maroon statement
 * (height-capped), 18px subtitle tucked behind
 * the eagle, the LIVE eagle (depth-parallax head + eyes that track the
 * cursor and scroll direction, natural blink and breathing — EagleLive),
 * and the BRANDING ✦ DESIGN ✦ AI row crossing its lower third with the
 * caption at the fold.
 */
export function AboutHero() {
  return (
    // The hero runs TALLER than one viewport (128svh) purely to magnify the
    // bird: the statement stays pinned at the top (14svh padding keeps it
    // clear of the fixed navbar), the eagle's flex-1 zone
    // absorbs every extra pixel (so the bird grows AND sits lower), and the
    // bottom-anchored marquee rides down with the new fold. One number tunes
    // the whole composition; the copy can never be covered because the bird
    // remains in normal flow BELOW it.
    <section className="relative isolate flex h-[128svh] flex-col overflow-hidden bg-[#fff3d3] text-center text-black">
      {/* Statement (22:645) — Catilde 60px / 400 / normal / 3px tracking /
          #741A14 / centred. The words materialise from blur in random
          order on load — trionn's BlurTextReveal, same numbers. */}
      {/* No z-index: the eagle (later in the DOM) rides OVER the statement's
          lower line, exactly like the reference composition */}
      <BlurTextReveal
        as="h1"
        text={ABOUT_PAGE.hero.title}
        className="mx-auto max-w-[79.2%] shrink-0 pt-[clamp(88px,14svh,142px)] font-serif-luxury text-[clamp(19px,min(3.4vw,6.4svh),52px)] font-normal leading-[1.12] tracking-[0.05em] text-[#741a14]"
      />

      {/* Eagle (156:767) — sized purely by layout: in normal flow below
          the statement, taking every pixel the screen has left down to the
          fold. No transform scale — the shader composites onto an OPAQUE
          cream ground, so any box overlap would hide the copy above it
          (the compact statement type is what buys the bird its height).
          The (smaller, lower) marquee band crosses the lower feathers;
          z-10 keeps the bird above the band. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2.2, delay: 0.4, ease: "easeOut" }}
        className="relative z-10 mt-[0.5svh] flex min-h-0 w-full flex-1 items-start justify-center"
      >
        <EagleLive
          src="/figma/about/eagle-live.webp"
          depthSrc="/figma/about/eagle-live-depth.jpg"
          ariaLabel="Bald eagle"
          className="aspect-[1024/1094] h-full max-h-full w-auto max-w-[92vw]"
        />
      </motion.div>

      {/* BRANDING ✦ DESIGN ✦ AI crossing the eagle's lower third, caption
          on the fold (22:739-745). Pointer-transparent (the depth parallax
          tracks the cursor window-wide, but keeping the band inert also
          keeps text selection off the marquee). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-[0.5svh]">
        <WordMarquee words={ABOUT_PAGE.words} caption={ABOUT_PAGE.wordsCaption} tight />
      </div>
    </section>
  );
}

/* ————— Our values — trionn.com's paperfold accordion, ported verbatim
   from their shipped bundle (GSAP ScrollTrigger timeline there →
   motion/react function-form transforms here, same math).

   Their recipe: every card starts at rotateX(-90deg) hinged "top center"
   inside a perspective:2500px stack, invisible; ONE scrubbed timeline
   spans 150px of scroll per card on desktop (200 on tablet ≤1024, 180 on
   mobile ≤767), starting when the stack's top crosses 80% (70% / 65%) of
   the viewport. Card r occupies timeline slot 0.5·r: the fold opens
   -90→0 over 0.6 units on power2.out (cubic), the white face fades in
   over 0.36 on power1.in (quad) at +0.09, and the black shadow sheet
   fades 0.08→0 over 0.42 on power1.out at +0.18. Scrub = pure function
   of scroll position, fully reversible — scroll away and it folds back.

   Their left "Our values" column pins while the stack unfolds
   (ScrollTrigger pin, pinSpacing:false, ≥1024 only); CSS sticky inside
   the section gives exactly that for free, lg-gated like theirs. ————— */

const FOLD = {
  slot: 0.5, // timeline gap between consecutive cards
  fold: 0.6, // rotateX -90 -> 0
  faceDelay: 0.09,
  face: 0.36, // card face opacity 0 -> 1
  shadowDelay: 0.18,
  shadow: 0.42, // shadow sheet opacity 0.08 -> 0
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const outCubic = (t: number) => 1 - (1 - t) ** 3; // gsap power2.out
const inQuad = (t: number) => t * t; // gsap power1.in
const outQuad = (t: number) => 1 - (1 - t) ** 2; // gsap power1.out

function FoldCard({
  T,
  index,
  title,
  body,
}: {
  T: MotionValue<number>;
  index: number;
  title: string;
  body: string;
}) {
  const at = index * FOLD.slot;
  const rotateX = useTransform(T, (t) => -90 * (1 - outCubic(clamp01((t - at) / FOLD.fold))));
  const visibility = useTransform(T, (t) => (t >= at ? "visible" : "hidden"));
  const face = useTransform(T, (t) =>
    inQuad(clamp01((t - at - FOLD.faceDelay) / FOLD.face))
  );
  const shadow = useTransform(
    T,
    (t) => 0.08 * (1 - outQuad(clamp01((t - at - FOLD.shadowDelay) / FOLD.shadow)))
  );
  return (
    <motion.article
      style={{ rotateX, visibility, transformOrigin: "top center", backfaceVisibility: "hidden" }}
      className="relative"
    >
      {/* the face carries the white bg (trionn: .paperfold-card-inner) so
          the folding plane is just a faint dark sheet until it opens */}
      <motion.div
        style={{ opacity: face }}
        className="grid h-[max(88px,8.14vw)] grid-cols-1 items-center gap-2 bg-white pl-[4.06%] pr-[1.27%] sm:grid-cols-[51.5%_1fr]"
      >
        <h3 className="font-sans-luxury text-[max(18px,1.98vw)] font-medium leading-[1.5] text-black">
          {title}
        </h3>
        <p className="hidden max-w-[373px] font-sans-luxury text-[max(12px,1.06vw)] font-medium leading-[1.5] text-black sm:block">
          {body}
        </p>
      </motion.div>
      <motion.div
        style={{ opacity: shadow }}
        className="pointer-events-none absolute inset-0 bg-black/80"
      />
    </motion.article>
  );
}

function ValuesSection() {
  const stackRef = useRef<HTMLDivElement>(null);
  const n = ABOUT_PAGE.values.length;
  const total = FOLD.slot * (n - 1) + FOLD.fold;

  // trigger geometry, measured the way trionn's ScrollTrigger computes it:
  // start when the stack top crosses startFrac of the viewport, span
  // per-card px × cards. startY=∞ until measured keeps SSR + first client
  // render identical (everything folded) — no hydration mismatch.
  const [geom, setGeom] = useState({ startY: Number.POSITIVE_INFINITY, span: 1 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = stackRef.current;
      if (!el) return;
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      const tablet = window.matchMedia("(min-width: 768px) and (max-width: 1024px)").matches;
      const startFrac = mobile ? 0.65 : tablet ? 0.7 : 0.8;
      const per = mobile ? 180 : tablet ? 200 : 150;
      // rect + scrollY, NOT offsetTop (offsetTop measures against a
      // positioned ancestor before motion writes transforms — learned in
      // the previous values implementation)
      const top = el.getBoundingClientRect().top + window.scrollY;
      const next = { startY: top - window.innerHeight * startFrac, span: per * n };
      setGeom((g) => (g.startY === next.startY && g.span === next.span ? g : next));
      // debug-inspectable snapshot of what the fold math actually uses
      el.dataset.fold = `${Math.round(next.startY)}:${next.span}`;
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [n]);

  const { scrollY } = useScroll();
  // T = position on trionn's timeline: 0.5 per card + 0.6 for the last fold
  const T = useTransform(scrollY, (y) => clamp01((y - geom.startY) / geom.span) * total);

  return (
    <section className="pt-[max(64px,10.98vw)]">
      <div className="grid grid-cols-1 items-start gap-10 pl-[9.59%] pr-[10.45%] lg:grid-cols-[34.7%_1fr] lg:gap-0">
        {/* Our values — Catilde 70, tracking 3.5 (22:775); pinned (sticky)
            while the stack unfolds, exactly trionn's pin behaviour */}
        <div className="transform-gpu lg:sticky lg:top-[15svh] lg:self-start">
          {/* trionn heading reveal: per-CHAR blur cascade in random order */}
          <BlurTextReveal
            as="h2"
            mode="chars"
            text={ABOUT_PAGE.valuesHeading}
            className="font-serif-luxury text-[max(38px,4.63vw)] font-normal leading-normal tracking-[0.05em] text-[#741a14]"
          />
        </div>

        <div>
          <Reveal>
            <p className="max-w-[373px] font-sans-luxury text-[max(12px,1.06vw)] font-medium leading-[1.5] text-black">
              {ABOUT_PAGE.valuesIntro}
            </p>
          </Reveal>

          {/* the paperfold stack (trionn: inline perspective 2500px) */}
          <div
            ref={stackRef}
            style={{ perspective: "2500px" }}
            className="mt-[max(24px,4.83vw)] flex flex-col gap-[4px]"
          >
            {ABOUT_PAGE.values.map((v, i) => (
              <FoldCard key={v} T={T} index={i} title={v} body={ABOUT_PAGE.valueBody} />
            ))}
          </div>

          {/* ✦ WHAT WE BELIEVE SHAPES BETTER WORK. (22:813) */}
          <div className="mt-[max(20px,3.3vw)] flex items-center gap-[5px]">
            <Star4 className="w-[max(12px,0.794vw)]" fill="#741a14" />
            <Eyebrow>{ABOUT_PAGE.valuesCaption}</Eyebrow>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AboutBody() {
  return (
    <div className="bg-[#fff3d3] pb-[max(72px,13vw)] text-black">
      {/* AT MAPLE, + statement (22:754/752) — 16 bold maroon + 30.22 Medium */}
      <section className="pl-[9.66%] pr-[8%] pt-[max(56px,7.47vw)]">
        <Reveal>
          <span className="font-sans-luxury text-[max(13px,1.06vw)] font-bold uppercase leading-[1.5] text-[#741a14]">
            {ABOUT_PAGE.atMaple}
          </span>
        </Reveal>
        {/* trionn paragraph reveal: per-WORD blur cascade */}
        <BlurTextReveal
          text={ABOUT_PAGE.atMapleBody}
          className="mt-[max(6px,0.66vw)] max-w-[643px] font-sans-luxury text-[max(19px,2vw)] font-medium leading-[1.5] text-black"
        />
      </section>

      <Rule className="mt-[max(32px,5.03vw)]" />

      {/* Badge + mission (22:763-768 / 22:756 / Group 20) */}
      <section className="grid grid-cols-1 gap-12 pl-[9.66%] pr-[11.57%] pt-[max(40px,6.55vw)] lg:grid-cols-[68.7%_1fr] lg:gap-0">
        <Reveal>
          <div className="flex h-[79px] w-[max(240px,18vw)] overflow-hidden rounded-[4px] border border-[#741a14]">
            <div className="flex w-[37.5%] items-center justify-center bg-[#741a14]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/logo-mark.svg" alt="Maple Studios" className="h-[27px] w-auto" />
            </div>
            <div className="flex flex-1 items-center px-3">
              <span className="font-sans-luxury text-[9px] font-bold uppercase leading-[1.4] text-[#741a14]">
                {ABOUT_PAGE.badge}
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="flex flex-col gap-6">
          {ABOUT_PAGE.mission.map((m, i) => (
            <p
              key={i}
              className="max-w-[373px] font-sans-luxury text-[max(12px,1.06vw)] leading-[1.5] text-black"
            >
              {m}
            </p>
          ))}
          <UnderlineLink
            label={ABOUT_PAGE.missionCta}
            href="/contact"
            width="max(191px,12.632vw)"
            className="mt-[max(16px,4vw)]"
          />
        </Reveal>
      </section>

      <Rule starLeft="20.5%" className="mt-[max(56px,14.2vw)]" />

      {/* Our values — trionn paperfold (video reference) */}
      <ValuesSection />

      {/* Founder + team (Figma 2124:211 / 2124:105 lower region) */}
      <FounderSection />
      <TeamSection />
    </div>
  );
}
