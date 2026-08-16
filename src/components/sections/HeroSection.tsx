"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { ABOUT_DATA, HERO_DATA } from "@/lib/constants";
import MapleMark from "@/components/common/MapleMark";
import BuildTimer from "@/components/common/BuildTimer";

/** One word of the pinned About statement — lights up over its own slice of
    the pin progress (function-form transform: WAAPI-safe inside sticky). */
function PinnedWord({
  progress,
  word,
  index,
  total,
}: {
  progress: MotionValue<number>;
  word: string;
  index: number;
  total: number;
}) {
  const start = 0.32 + (index / total) * 0.3;
  const opacity = useTransform(progress, (p) =>
    p <= start ? 0.1 : p >= start + 0.12 ? 1 : 0.1 + ((p - start) / 0.12) * 0.9
  );
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {word}
    </motion.span>
  );
}

/**
 * Hero — Figma node 120:980 (canvas 1512 x 797).
 * All absolute positions are % of that canvas so the layout scales.
 */
export default function HeroSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });
  // Scene A (hero content) moves up and fades out; Scene B (the About
  // statement) then fades in word-by-word IN PLACE on the same pinned
  // backdrop — only the texts transition, the screen never appears to move
  // to another section.
  // FUNCTION-form transforms on purpose: array-form opacity here gets compiled
  // by motion into a WAAPI ScrollTimeline animation whose projected range
  // breaks inside this sticky wrapper (opacity ran 1→0→1). Function transforms
  // cannot become keyframes, so they stay on the reliable JS path.
  // Long runway (260vh wrapper) so every stage breathes.
  const ramp = (p: number, a: number, b: number) =>
    p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a);
  const contentOpacity = useTransform(scrollYProgress, (p) => 1 - ramp(p, 0.08, 0.3));
  const contentY = useTransform(scrollYProgress, (p) => ramp(p, 0.08, 0.3) * -80);
  // The glassy M is NOT part of the dissolve: it drifts DOWN into the empty
  // middle of the About layout (between the left rail and the mission copy,
  // straddling the star divider) and settles there as a large faint ghost —
  // the gap in the reference composition is exactly the mark's footprint.
  const markOpacity = useTransform(scrollYProgress, (p) => 1 - ramp(p, 0.08, 0.34) * 0.8);
  const markY = useTransform(scrollYProgress, (p) => `${ramp(p, 0.08, 0.34) * 19}vh`);
  const markScale = useTransform(scrollYProgress, (p) => 1 + ramp(p, 0.08, 0.34) * 0.08);
  // Scene B container: gate + gentle settle while its words light up
  // (starts before Scene A fully exits so the swap never has a dim gap)
  const aboutOpacity = useTransform(scrollYProgress, (p) => ramp(p, 0.26, 0.4));
  const aboutY = useTransform(scrollYProgress, (p) => (1 - ramp(p, 0.26, 0.4)) * 40);
  const aboutWords = ABOUT_DATA.headline.split(" ");
  // The statement holds the COMPLETE screen alone while its words light up;
  // one more scroll beat then slides the whole sheet: statement screen
  // exits upward as the mission screen rides in from below — percentage y
  // (of the 100vh panels) keeps it SSR-safe, no vh math in JS.
  // -130%, not -100: the 120px statement can overflow its 100vh panel on
  // short windows, and a -100% slide would leave the overflow tail peeking
  const stmtY = useTransform(scrollYProgress, (p) => `${-ramp(p, 0.78, 0.92) * 130}%`);
  const missionY = useTransform(scrollYProgress, (p) => `${(1 - ramp(p, 0.78, 0.92)) * 100}%`);
  // the statement's own star-rule draws in as the last words finish
  const stmtRuleOpacity = useTransform(scrollYProgress, (p) => ramp(p, 0.68, 0.76));
  // Stage 2 of the About screen: divider, mission columns and vision line
  // compose themselves after the statement has fully lit (~0.72)
  const colsOpacity = useTransform(scrollYProgress, (p) => ramp(p, 0.82, 0.9));
  const colsY = useTransform(scrollYProgress, (p) => (1 - ramp(p, 0.82, 0.9)) * 30);
  const visionOpacity = useTransform(scrollYProgress, (p) => ramp(p, 0.84, 0.92));

  return (
    <div ref={wrapRef} id="hero" className="relative h-[620vh]">
    {/* Transparent on purpose: the maroon scene (radial + cycling shades +
        breathing glow) is painted ONCE by <SceneBackdrop /> behind the hero,
        the About screen and the marquee — one continuous field, no seams. */}
    <section className="sticky top-0 isolate h-svh transform-gpu overflow-hidden text-white">
      {/* The hero is a Figma CANVAS: every position below is a % of this box
          and every size a % of its width, so the composition only holds if the
          BOX scales. Sizes are therefore cqw — a share of this element — and
          never cap out; capping them (as vw clamps did) froze the artwork at
          the 1512 design width while the % positions kept spreading, which is
          what stranded the M in the middle of wide screens. No max-width on
          the box either: the canvas rides the full viewport at every size, so
          the composition scales 1:1 on big monitors instead of shrinking
          inside a centred 1920 cap. */}
      <div className="relative mx-auto h-full w-full [container-type:inline-size]">
      {/* Everything below dissolves while the hero is pinned */}
      <motion.div style={{ opacity: contentOpacity, y: contentY }} className="absolute inset-0">

      {/* ——— Orbit lines (behind everything) ——— */}
      <div
        className="absolute left-[-15.46%] top-[20.98%] flex h-[120.71%] w-[131.83%] items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        {/* Grand dashed orbit sweeping the hero, rotated like the Figma frame */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/figma/orbit-grand.png"
          alt=""
          className="w-[97.4%] rotate-[-15.55deg] select-none"
        />
      </div>
      {/* Right dashed orbit under the badge */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/figma/orbit-right.svg"
        alt=""
        className="absolute left-[32.11%] top-[50.81%] w-[72.85%] pointer-events-none select-none"
      />
      {/* Left solid orbit near START A PROJECT */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/figma/orbit-left.svg"
        alt=""
        className="absolute left-[-4.43%] top-[53.35%] w-[33.24%] pointer-events-none select-none"
      />

      {/* Little 4-point star sparkle (Figma 47:1042 — 2s rotation loop) */}
      <motion.img
        src="/figma/star-hero.svg"
        alt=""
        initial={{ rotate: -360 }}
        animate={{ rotate: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 2, repeat: Infinity, repeatDelay: 1.6 }}
        className="absolute left-[28.09%] top-[52.06%] w-[max(13px,1.37cqw)] pointer-events-none select-none"
      />

      {/* Tiny glass orb over the headline (as in Figma render) */}
      <div
        className="absolute left-[35.9%] top-[28.6%] size-[max(26px,3cqw)] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,243,211,0.22), rgba(255,243,211,0.04) 55%, transparent 75%)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
        aria-hidden="true"
      />

      {/* ——— Headline + START A PROJECT (one anchored block, top-left) ———
          Two-line Catilde lockup; the CTA is anchored below it so they can
          never collide at short viewports. */}
      <div className="absolute left-[1.85%] top-[17.2%] z-10">
        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="font-serif-luxury text-[#fff3d3] text-[max(42px,5.29cqw)] font-normal leading-[1.11] tracking-[0.05em] whitespace-nowrap"
        >
          <span className="block">{HERO_DATA.headlineMain}</span>
          <span className="block">{HERO_DATA.headlineSub}</span>
        </motion.h1>

        <motion.a
          href="#contact"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="group ml-[0.5%] mt-[max(20px,2.2cqw)] flex w-[max(150px,12.63cqw)] flex-col"
        >
          <span className="flex items-center justify-between">
            <span className="font-sans-luxury text-[max(12px,0.93cqw)] font-bold uppercase tracking-[-0.024em] text-[#fff3d3]">
              {HERO_DATA.cta}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figma/arrow-cream.svg"
              alt=""
              className="w-[max(15px,0.99cqw)] transition-transform duration-300 group-hover:translate-x-1"
            />
          </span>
          <span className="mt-[9px] h-px w-full bg-[#fff3d3]/90" />
        </motion.a>
      </div>

      {/* ——— Build-time badge (right, Figma 44:925) ——— */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.55 }}
        className="absolute left-[81.02%] top-[48.56%] z-10 w-[max(190px,14.42cqw)] max-md:left-auto max-md:right-[4%] max-md:top-[34%]"
      >
        <div className="flex aspect-[218/79] w-full overflow-hidden rounded-[4px] border border-white">
          {/* wider than the Figma 46.79%: the live stopwatch carries a third
              unit (seconds), which the original two-unit box cannot hold */}
          <div className="flex w-[57%] flex-col items-center justify-center rounded-[4px] bg-[#fff3d3] px-[2%] text-[#741a14]">
            <BuildTimer className="font-sans-luxury text-[max(13px,1.15cqw)] font-bold leading-[1.4]" />
            <span className="font-sans-luxury text-[max(7px,0.68cqw)] font-normal leading-[1.3] tracking-[0.08em]">
              {HERO_DATA.badge.label}
            </span>
          </div>
          <div className="flex flex-1 items-center pl-[5%]">
            <span className="font-sans-luxury text-[max(8px,0.73cqw)] font-medium uppercase leading-[1.5] text-white">
              Avg. time to
              <br />
              first live build
            </span>
          </div>
        </div>
      </motion.div>

      {/* ——— Description (bottom-right, Figma 10:7510) ——— */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.65 }}
        className="absolute left-[81.02%] top-[72.4%] z-10 w-[16.47%] min-w-[200px] -translate-y-1/2 font-sans-luxury text-[max(13px,1.19cqw)] leading-[1.35] text-white max-md:left-auto max-md:right-[6%] max-md:top-[85%] max-md:w-[min(280px,60vw)]"
      >
        {HERO_DATA.subtitle}
      </motion.p>

      {/* ——— Scroll-down indicator (bottom-left, Figma 10:7505/7506) ——— */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute left-[2.18%] top-[73.4%] z-10 size-[max(20px,1.32cqw)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/scroll-circle.svg" alt="" className="absolute inset-0 size-full" />
        {/* rotation lives on the img, bob on the wrapper — motion's transform
            would otherwise discard the rotate class and the arrow reads sideways */}
        <motion.span
          animate={{ y: [0, 3.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/figma/arrow-down-sm.svg" alt="" className="w-[max(7.8px,0.516vw)] rotate-90" />
        </motion.span>
      </motion.div>

      </motion.div>

      {/* ——— Glassy wireframe M ———
          Sized per the Figma inspect (left 472 / top 140 / right 469 / bottom 285
          on the 1512x797 canvas = centered x, center-y 40.9%, width 572).
          Lives OUTSIDE the Scene A dissolve: full strength over the hero
          (z-20 glass, so the "se." of "purpose." reads through it), then it
          settles to a faint floating ghost behind the About statement. */}
      <div className="absolute left-1/2 top-[40.9%] z-20 w-[max(300px,37.83cqw)] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        {/* scroll-driven: fade to ghost, drift down, grow slightly */}
        <motion.div style={{ opacity: markOpacity, y: markY, scale: markScale }}>
          {/* entrance */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, delay: 0.3, ease: "easeOut" }}
          >
            {/* perpetual float — keeps breathing after it becomes the ghost */}
            <motion.div
              animate={{ y: [0, -26, 0], rotate: [0, 1.4, 0] }}
              transition={{ duration: 8, ease: "easeInOut", repeat: Infinity }}
            >
              <MapleMark className="h-auto w-full" />
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* ——— Scene B: the full About screen composes itself IN PLACE on the
          pinned backdrop — statement word by word first, then the divider,
          mission columns and vision line transition in beneath it ——— */}
      <motion.div
        style={{ opacity: aboutOpacity, y: aboutY }}
        className="absolute inset-0 z-10 overflow-hidden"
      >
        <span className="absolute left-5 top-[92px] z-20 text-[max(12px,0.794cqw)] font-sans-luxury tracking-widest uppercase font-semibold text-white/70 sm:left-8">
          {ABOUT_DATA.tag}
        </span>

        {/* ——— Screen B1: the statement OWNS the full viewport while its
            words light up — Catilde 80 / 300 / lh 100% / cream (spec).
            80px = 5.29vw of the 1512 canvas; vh-capped for short windows.
            pt clears the fixed navbar band so line one never rides into
            the LET'S TALK / MENU pills. ——— */}
        <motion.div
          style={{ y: stmtY }}
          className="absolute inset-0 flex [align-items:safe_center] px-6 pt-[clamp(96px,15vh,150px)] pb-[clamp(12px,2.5vh,28px)] sm:px-12"
        >
          <div className="mx-auto w-full max-w-6xl lg:mx-0 lg:ml-[12.29%] lg:mr-[6.57%] lg:w-auto lg:max-w-none">
            {/* 5.1% of the canvas is the design's 77px at 1512; the 10vh arm
                holds the statement inside short windows */}
            <p className="font-serif-luxury text-[max(30px,min(5.1cqw,10vh))] font-light leading-none text-[#fff3d3]">
              {aboutWords.map((word, i) => (
                <span key={`${word}-${i}`}>
                  <PinnedWord progress={scrollYProgress} word={word} index={i} total={aboutWords.length} />{" "}
                </span>
              ))}
            </p>
            {/* the star-rule sits SNUG under the statement (no dead band to
                the fold) and exits upward with it */}
            <motion.div style={{ opacity: stmtRuleOpacity }} className="relative mt-[clamp(16px,3vh,32px)] w-full">
              <div className="h-px w-full bg-white/20" />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="star-twinkle absolute left-[65.5%] top-1/2 w-[max(21px,1.389vw)] -translate-x-1/2 -translate-y-1/2"
                aria-hidden="true"
              >
                <path
                  d="M11.9824 0.876953C12.5356 3.9958 13.7265 6.52544 15.5811 8.42188C17.424 10.3064 19.9115 11.5525 23.0479 12.1406C19.9126 12.646 17.4512 13.8353 15.6152 15.6768C13.763 17.5346 12.5587 20.0435 11.9326 23.1494C11.3843 20.0429 10.2538 17.5178 8.43652 15.6611C6.62345 13.8088 4.14106 12.6354 0.912109 12.2012C4.11282 11.4892 6.57827 10.2661 8.39551 8.41113C10.2177 6.55112 11.3739 4.07043 11.9824 0.876953Z"
                  fill="#FFF3D3"
                  stroke="#FFF"
                  strokeWidth="0.289"
                />
              </svg>
            </motion.div>
          </div>
        </motion.div>

        {/* ——— Screen B2: divider + mission columns + vision — rides in
            from below as one sheet while the statement screen exits up
            (the "screen slides, the part below comes" beat) ——— */}
        {/* justify-START, not center: the columns must land right under the
            rule's line (top of the screen) instead of drifting to the
            middle/bottom of the panel */}
        <motion.div
          style={{ y: missionY }}
          className="absolute inset-0 flex flex-col justify-start gap-[clamp(28px,3.4vh,50px)] px-6 pt-[clamp(120px,20vh,190px)] pb-[clamp(12px,2.5vh,28px)] sm:px-12"
        >
        <div className="relative flex flex-col gap-[clamp(28px,3.4vh,50px)] lg:mx-[1%]">
          {/* (the star-rule lives ONLY with the statement now — a copy here
              doubled up on screen mid-slide) */}
          {/* Stage 2b: mission columns — left rail far left, mission copy
              starting just right of the centre line (Figma image spec) */}
          <motion.div
            style={{ opacity: colsOpacity, y: colsY }}
            className="grid w-full grid-cols-1 items-start gap-8 md:grid-cols-[65.5%_1fr]"
          >
            <div className="flex flex-col gap-1 text-[max(12px,0.794cqw)] font-sans-luxury tracking-widest text-white/70 uppercase leading-relaxed font-medium">
              {ABOUT_DATA.leftColumn.map((line, idx) => (
                <p key={idx}>{line}</p>
              ))}
            </div>
            <div className="flex flex-col items-start gap-[clamp(24px,5vh,64px)] md:pl-[1.5%]">
              <p className="max-w-[max(400px,26.46cqw)] text-[max(16px,1.19cqw)] font-sans-luxury text-white/90 leading-relaxed font-light">
                {ABOUT_DATA.rightText}
              </p>
              {/* underlined CTA with arrow (site link pattern) */}
              <a href="/about" className="group flex w-[max(150px,12.63vw)] flex-col">
                <span className="flex items-center justify-between">
                  <span className="font-sans-luxury text-[max(11px,0.93vw)] font-bold uppercase tracking-[-0.024em] text-[#fff3d3]">
                    {ABOUT_DATA.cta}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/figma/arrow-cream.svg"
                    alt=""
                    className="w-[max(15px,0.992vw)] transition-transform duration-300 group-hover:translate-x-1"
                  />
                </span>
                <span className="mt-[3px] h-px w-full bg-[#fff3d3]/90" />
              </a>
            </div>
          </motion.div>

          {/* Stage 2c: vision line — sits well below the columns (reference) */}
          <motion.div
            style={{ opacity: visionOpacity }}
            className="w-full pt-[clamp(12px,7vh,110px)]"
          >
            <p className="text-[max(11px,0.727cqw)] font-sans-luxury tracking-widest uppercase text-white/60 font-medium">
              {ABOUT_DATA.focusedVision}
              <br />
              {ABOUT_DATA.measuredExecution}
            </p>
          </motion.div>
        </div>
        </motion.div>
      </motion.div>
      </div>
    </section>
    </div>
  );
}
