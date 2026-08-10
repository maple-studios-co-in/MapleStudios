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
 * About hero — Figma 22:625 compressed into ONE viewport: CREAM canvas,
 * Catilde 60 maroon statement (60px exact at full size, height-capped so
 * the whole scene always fits a single screen), 18px subtitle tucked behind
 * the eagle, the LIVE eagle (depth-parallax head + eyes that track the
 * cursor and scroll direction, natural blink and breathing — EagleLive),
 * and the BRANDING ✦ DESIGN ✦ AI row crossing its lower third with the
 * caption at the fold.
 */
export function AboutHero() {
  return (
    <section className="relative isolate flex h-[100svh] flex-col overflow-hidden bg-[#fff3d3] text-center text-black">
      {/* Statement (22:645) — Catilde 60px / 400 / normal / 3px tracking /
          #741A14 / centred. The words materialise from blur in random
          order on load — trionn's BlurTextReveal, same numbers. */}
      {/* No z-index: the eagle (later in the DOM) rides OVER the statement's
          lower line, exactly like the reference composition */}
      <BlurTextReveal
        as="h1"
        text={ABOUT_PAGE.hero.title}
        className="mx-auto max-w-[79.2%] shrink-0 pt-[clamp(56px,10.5svh,100px)] font-serif-luxury text-[clamp(22px,min(3.97vw,7.5svh),60px)] font-normal leading-[1.12] tracking-[0.05em] text-[#741a14]"
      />

      {/* Subtitle (22:627) — sits partly behind the eagle, per the design */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, delay: 0.3 }}
        className="mx-auto mt-[1svh] max-w-[469px] shrink-0 font-sans-luxury text-[clamp(13px,1.19vw,18px)] leading-normal text-black"
      >
        {ABOUT_PAGE.hero.subtitle}
      </motion.p>

      {/* Eagle (156:767) — sits BELOW the copy in normal flow and takes
          whatever height the screen has left, so it never covers a word of
          the statement or subtitle. z-10 keeps it above the marquee band
          that crosses its lower third. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2.2, delay: 0.4, ease: "easeOut" }}
        className="relative z-10 mt-[1.5svh] flex min-h-0 w-full flex-1 items-start justify-center"
      >
        <EagleLive
          src="/figma/about/eagle-live.webp"
          depthSrc="/figma/about/eagle-live-depth.jpg"
          ariaLabel="Bald eagle"
          className="aspect-[1024/1094] h-full max-h-full w-auto max-w-[92vw] origin-top scale-[1.08]"
        />
      </motion.div>

      {/* BRANDING ✦ DESIGN ✦ AI crossing the eagle's lower third, caption
          on the fold (22:739-745). Pointer-transparent (the depth parallax
          tracks the cursor window-wide, but keeping the band inert also
          keeps text selection off the marquee). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-[1.5svh]">
        <WordMarquee words={ABOUT_PAGE.words} caption={ABOUT_PAGE.wordsCaption} />
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
        className="grid h-[clamp(88px,8.14vw,123px)] grid-cols-1 items-center gap-2 bg-white pl-[4.06%] pr-[1.27%] sm:grid-cols-[51.5%_1fr]"
      >
        <h3 className="font-sans-luxury text-[clamp(18px,1.98vw,30px)] font-medium leading-[1.5] text-black">
          {title}
        </h3>
        <p className="hidden max-w-[373px] font-sans-luxury text-[clamp(12px,1.06vw,16px)] font-medium leading-[1.5] text-black sm:block">
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
    <section className="pt-[clamp(64px,10.98vw,166px)]">
      <div className="grid grid-cols-1 items-start gap-10 pl-[9.59%] pr-[10.45%] lg:grid-cols-[34.7%_1fr] lg:gap-0">
        {/* Our values — Catilde 70, tracking 3.5 (22:775); pinned (sticky)
            while the stack unfolds, exactly trionn's pin behaviour */}
        <div className="lg:sticky lg:top-[15svh] lg:self-start">
          {/* trionn heading reveal: per-CHAR blur cascade in random order */}
          <BlurTextReveal
            as="h2"
            mode="chars"
            text={ABOUT_PAGE.valuesHeading}
            className="font-serif-luxury text-[clamp(38px,4.63vw,70px)] font-normal leading-normal tracking-[0.05em] text-[#741a14]"
          />
        </div>

        <div>
          <Reveal>
            <p className="max-w-[373px] font-sans-luxury text-[clamp(12px,1.06vw,16px)] font-medium leading-[1.5] text-black">
              {ABOUT_PAGE.valuesIntro}
            </p>
          </Reveal>

          {/* the paperfold stack (trionn: inline perspective 2500px) */}
          <div
            ref={stackRef}
            style={{ perspective: "2500px" }}
            className="mt-[clamp(24px,4.83vw,73px)] flex flex-col gap-[4px]"
          >
            {ABOUT_PAGE.values.map((v, i) => (
              <FoldCard key={v} T={T} index={i} title={v} body={ABOUT_PAGE.valueBody} />
            ))}
          </div>

          {/* ✦ WHAT WE BELIEVE SHAPES BETTER WORK. (22:813) */}
          <div className="mt-[clamp(20px,3.3vw,50px)] flex items-center gap-[5px]">
            <Star4 className="w-[12px]" fill="#741a14" />
            <Eyebrow>{ABOUT_PAGE.valuesCaption}</Eyebrow>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AboutBody() {
  return (
    <div className="bg-[#fff3d3] pb-[clamp(72px,13vw,196px)] text-black">
      {/* AT MAPLE, + statement (22:754/752) — 16 bold maroon + 30.22 Medium */}
      <section className="pl-[9.66%] pr-[8%] pt-[clamp(56px,7.47vw,113px)]">
        <Reveal>
          <span className="font-sans-luxury text-[clamp(13px,1.06vw,16px)] font-bold uppercase leading-[1.5] text-[#741a14]">
            {ABOUT_PAGE.atMaple}
          </span>
        </Reveal>
        {/* trionn paragraph reveal: per-WORD blur cascade */}
        <BlurTextReveal
          text={ABOUT_PAGE.atMapleBody}
          className="mt-[clamp(6px,0.66vw,10px)] max-w-[643px] font-sans-luxury text-[clamp(19px,2vw,30.2px)] font-medium leading-[1.5] text-black"
        />
      </section>

      <Rule className="mt-[clamp(32px,5.03vw,76px)]" />

      {/* Badge + mission (22:763-768 / 22:756 / Group 20) */}
      <section className="grid grid-cols-1 gap-12 pl-[9.66%] pr-[11.57%] pt-[clamp(40px,6.55vw,99px)] lg:grid-cols-[68.7%_1fr] lg:gap-0">
        <Reveal>
          <div className="flex h-[79px] w-[clamp(240px,18vw,272px)] overflow-hidden rounded-[4px] border border-[#741a14]">
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
              className="max-w-[373px] font-sans-luxury text-[clamp(12px,1.06vw,16px)] leading-[1.5] text-black"
            >
              {m}
            </p>
          ))}
          <UnderlineLink
            label={ABOUT_PAGE.missionCta}
            href="/contact"
            width="191px"
            className="mt-[clamp(16px,4vw,61px)]"
          />
        </Reveal>
      </section>

      <Rule starLeft="20.5%" className="mt-[clamp(56px,14.2vw,215px)]" />

      {/* Our values — trionn paperfold (video reference) */}
      <ValuesSection />

      {/* Founder + team (Figma 2124:211 / 2124:105 lower region) */}
      <FounderSection />
      <TeamSection />
    </div>
  );
}
