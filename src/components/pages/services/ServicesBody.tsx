"use client";

import { Fragment, useRef, useState } from "react";
import Image from "next/image";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { SERVICES_PAGE } from "@/lib/constants";
import { Eyebrow, Reveal, UnderlineLink } from "../PageKit";

/* Linear 0→1 ramp between two progress marks (function-form transforms stay
   on motion's JS path — see HeroSection's WAAPI note). */
const ramp = (p: number, a: number, b: number) =>
  p <= a ? 0 : p >= b ? 1 : (p - a) / (b - a);

/** Figma 4-point star (24 viewBox) in any fill — hero eyebrow, marquee, caption. */
export function Star4({
  className = "",
  fill = "#FFF3D3",
  delay = 0,
}: {
  className?: string;
  fill?: string;
  /** stagger the twinkle so a row of stars never wobbles in lockstep */
  delay?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`star-twinkle shrink-0 ${className}`}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
      aria-hidden="true"
    >
      <path
        d="M11.9824 0.876953C12.5356 3.9958 13.7265 6.52544 15.5811 8.42188C17.424 10.3064 19.9115 11.5525 23.0479 12.1406C19.9126 12.646 17.4512 13.8353 15.6152 15.6768C13.763 17.5346 12.5587 20.0435 11.9326 23.1494C11.3843 20.0429 10.2538 17.5178 8.43652 15.6611C6.62345 13.8088 4.14106 12.6354 0.912109 12.2012C4.11282 11.4892 6.57827 10.2661 8.39551 8.41113C10.2177 6.55112 11.3739 4.07043 11.9824 0.876953Z"
        fill={fill}
      />
    </svg>
  );
}

/** Marquee word row: BRANDING ✦ DESIGN ✦ AI ✦ (Catilde 141.6px). */
export function WordMarquee({
  words,
  caption,
  color = "#741a14",
  star = "/figma/about/star-maroon-sm.svg",
  tight = false,
}: {
  words: string[];
  caption: string;
  color?: string;
  star?: string;
  /** hug the fold: trims the band's breathing room so the word row sits
      almost on the bottom edge (about hero under the magnified eagle) */
  tight?: boolean;
}) {
  const row = [...words, ...words, ...words];
  return (
    <div className={`overflow-hidden ${tight ? "py-[clamp(6px,0.8vw,14px)]" : "py-[clamp(24px,3vw,48px)]"}`}>
      <div className="animate-marquee flex w-max items-center gap-[3vw] whitespace-nowrap">
        {row.map((w, i) => (
          <span key={`${w}-${i}`} className="flex items-center gap-[3vw]">
            <span
              className={`font-serif-luxury uppercase leading-normal tracking-[0.05em] ${
                tight
                  ? "text-[clamp(28px,4.69vw,70.8px)]" // 0.5x — band shrinks, and being bottom-anchored the row drops toward the fold
                  : "text-[clamp(56px,9.37vw,141.6px)]"
              }`}
              style={{ color }}
            >
              {w}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={star}
              alt=""
              className="star-twinkle w-[21px] shrink-0"
              style={{ animationDelay: `${(i % 5) * 0.55}s` }}
            />
          </span>
        ))}
      </div>
      <p className={`${tight ? "mt-2" : "mt-6"} flex items-center justify-center gap-[5px] text-center`}>
        <Star4 className="w-[12px]" fill={color} />
        <Eyebrow color={color}>{caption}</Eyebrow>
      </p>
    </div>
  );
}

/* ————— Hero + intro + marquee: one continuous CREAM scene — the site's
   lighter shade for the canvas, the maroon for every word (the inverse of
   the old gradient treatment, flowing straight into the cream panels
   below). Figma 14:8640 + 14:8680 + Group 21 + 14:8697xx. ————— */
function ServicesHero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#fff3d3] text-center">
      {/* Eyebrow — ✦ WHAT WE DO BEST (14:8895) */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="flex items-center justify-center gap-[5px] pt-[clamp(140px,17.5vw,265px)]"
      >
        <Star4 className="w-[12px]" fill="#741a14" />
        <span className="font-sans-luxury text-[14px] font-bold uppercase leading-[16.88px] tracking-[-0.337px] text-[#741a14]">
          {SERVICES_PAGE.hero.eyebrow}
        </span>
      </motion.div>

      {/* Area of expertise — Catilde 80, tracking 4px (14:8662) */}
      <motion.h1
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.1 }}
        className="mt-[clamp(14px,2vw,30px)] font-serif-luxury text-[clamp(44px,5.29vw,80px)] font-normal leading-normal tracking-[0.05em] text-[#741a14]"
      >
        {SERVICES_PAGE.hero.title}
      </motion.h1>

      {/* Discipline list — Red Hat Bold 16, two centred lines (14:8896) */}
      <motion.p
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="mx-auto mt-[clamp(64px,10.8vw,164px)] max-w-[90%] font-sans-luxury text-[clamp(12px,1.06vw,16px)] font-bold uppercase leading-[1.5] text-[#741a14]"
      >
        {SERVICES_PAGE.hero.listLines[0]}
        <br className="hidden sm:block" /> {SERVICES_PAGE.hero.listLines[1]}
      </motion.p>

      {/* Scroll cue — left rail (14:8670/8671) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.8 }}
        className="absolute left-[2.18%] top-[38.7vw] hidden size-[20px] lg:block"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/scroll-circle-maroon.svg" alt="" className="absolute inset-0 size-full" />
        <motion.span
          animate={{ y: [0, 3.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/figma/arrow-down-sm-maroon.svg" alt="" className="w-[7.8px] rotate-90" />
        </motion.span>
      </motion.div>

      {/* Lower band — INVERTED per review: the site maroon becomes the
          canvas, the cream becomes the type. Holds the intro statement,
          twin links, marquee and caption; the original inter-block gap is
          split half cream (mt) / half maroon (pt) so the rhythm reads
          unchanged. */}
      <div className="mt-[clamp(48px,7.5vw,113px)] bg-[#741a14] pt-[clamp(48px,7.5vw,113px)]">
        {/* Intro statement — Catilde Light 80, cream on maroon (14:8680) */}
        <Reveal>
          <h2 className="mx-auto max-w-[80%] font-serif-luxury text-[clamp(38px,5.29vw,80px)] font-light leading-none text-[#fff3d3] lg:max-w-[76%]">
            {SERVICES_PAGE.intro}
          </h2>
        </Reveal>

        {/* Twin links — VIEW ALL PROJECTS / LET'S CONNECT (Group 21) */}
        <Reveal className="mt-[clamp(40px,5.29vw,80px)] flex flex-wrap items-center justify-center gap-[clamp(24px,5.29vw,80px)] px-6">
          {SERVICES_PAGE.introLinks.map((l) => (
            <UnderlineLink
              key={l.label}
              label={l.label}
              href={l.href}
              color="#fff3d3"
              arrow="/figma/arrow-cream.svg"
              width="191px"
            />
          ))}
        </Reveal>

        {/* BRANDING ✦ DESIGN ✦ AI marquee — cream on maroon (14:8697xx) */}
        <div className="mt-[clamp(56px,11vw,166px)] w-full select-none overflow-hidden">
          <div className="animate-marquee flex w-max items-center gap-[3vw] whitespace-nowrap">
            {[...Array(6)].map((_, i) => (
              <span
                key={i}
                className="flex items-center gap-[3vw] font-serif-luxury text-[clamp(56px,9.37vw,141.6px)] font-normal uppercase leading-normal tracking-[0.05em] text-[#fff3d3]"
              >
                {SERVICES_PAGE.words.map((word, wi) => (
                  <span key={word} className="flex items-center gap-[3vw]">
                    {word}
                    <Star4
                      className="aspect-square w-[clamp(14px,1.59vw,24px)]"
                      fill="#FFF3D3"
                      delay={((i * SERVICES_PAGE.words.length + wi) % 5) * 0.55}
                    />
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* ✦ CAPABILITIES SHAPED TO SCALE WITH AMBITION. (Group 22) */}
        <div className="mt-[clamp(24px,3.9vw,60px)] flex items-center justify-center gap-[5px] pb-[clamp(48px,6.35vw,96px)]">
          <Star4 className="w-[12px]" fill="#FFF3D3" />
          <span className="font-sans-luxury text-[14px] font-bold uppercase leading-[16.88px] tracking-[-0.337px] text-[#fff3d3]">
            {SERVICES_PAGE.wordsCaption}
          </span>
        </div>
      </div>
    </section>
  );
}

/* ————— Split-screen service panels (Figma Groups 29-31) with the
   trionn.com/services hand-off: each panel pins at the top of the viewport
   and the NEXT panel slides up OVER it (its pinned content never moves),
   exactly like the reference capture. Sibling sticky stack: later panels
   cover earlier ones; spacers between panels give each a pinned dwell. ————— */
function ServicePanel({
  panel,
  index,
}: {
  panel: (typeof SERVICES_PAGE.panels)[number];
  index: number;
}) {
  return (
    <div
      className="relative bg-[#fff3d3] lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden"
      style={{ zIndex: index + 1 }}
    >
      {/* Top rule + crossing star riding the panel's leading edge (Line 7 +
          Vector) — seated 11px inside the edge so the straddling ✦ is never
          clipped by the panel's overflow-hidden */}
      <div
        aria-hidden="true"
        className="absolute left-[7.87%] right-[6.08%] top-[11px] hidden h-px bg-black/60 lg:block"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/figma/about/star-maroon.svg"
        alt=""
        className="star-twinkle absolute left-[50.86%] top-[11px] hidden w-[21px] -translate-x-1/2 -translate-y-1/2 lg:block"
      />
      {/* Continuous centre divider (Line 8) — starts at the rule */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-[50.86%] top-[11px] hidden w-px bg-black/60 lg:block"
      />

      <div className="flex h-full items-center py-16 lg:py-0">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-0">
          {/* Left visual — 600x380, r7 (Link 14:8812) */}
          <div className="px-[8%] lg:pl-[10.28%] lg:pr-[10.32%]">
            <div className="overflow-hidden rounded-[7px] lg:translate-y-[2.9vw]">
              <Image
                src={panel.image}
                alt={panel.title}
                width={600}
                height={380}
                className="aspect-[600/380] w-full object-cover"
              />
            </div>
          </div>

          {/* Right column — heading, description, capabilities (14:8930-8959) */}
          <div className="px-[8%] lg:pl-[17.06%] lg:pr-[15.87%]">
            <h3 className="font-sans-luxury text-[clamp(22px,2.12vw,32px)] font-bold leading-[0.85] text-black">
              {panel.title}
            </h3>
            <p className="mt-[clamp(12px,1.79vw,27px)] whitespace-pre-line font-sans-luxury text-[clamp(14px,1.19vw,18px)] leading-normal text-black">
              {panel.description}
            </p>
            <p className="mt-[clamp(40px,7.34vw,111px)] font-sans-luxury text-[clamp(13px,1.06vw,16px)] font-bold uppercase leading-[16.88px] text-black">
              {panel.capsLabel}
            </p>
            <ul className="mt-[clamp(14px,2.31vw,35px)] flex flex-col gap-[0.79vw]">
              {panel.caps.map((c) => (
                <li
                  key={c}
                  className="border-b border-black/60 pb-[clamp(8px,1.06vw,16px)] font-sans-luxury text-[clamp(14px,1.19vw,18px)] leading-normal text-black lg:max-w-[84.8%]"
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServicePanels() {
  return (
    <section className="relative bg-[#fff3d3] pt-[clamp(48px,8.93vw,135px)]">
      {SERVICES_PAGE.panels.map((p, i) => (
        <Fragment key={p.id}>
          {/* Dwell runway: the previous panel stays pinned while this scrolls by */}
          {i > 0 ? <div aria-hidden="true" className="hidden lg:block lg:h-[80vh]" /> : null}
          <ServicePanel panel={p} index={i} />
        </Fragment>
      ))}
      {/* Trailing runway so the LAST panel also dwells pinned before releasing */}
      <div aria-hidden="true" className="hidden lg:block lg:h-[80vh]" />
    </section>
  );
}

/* ————— TECHNOLOGY STACK — staggered Catilde 141.6/0.7 lines (14:8827,
   15:9021) that light up character-by-character on scroll, exactly like the
   About statement's word-by-word reveal (HeroSection PinnedWord). ————— */
function LightChars({
  progress,
  text,
  from,
  total,
}: {
  progress: MotionValue<number>;
  text: string;
  from: number;
  total: number;
}) {
  return (
    <>
      {text.split("").map((ch, i) => (
        <LightChar key={`${ch}-${i}`} progress={progress} index={from + i} total={total}>
          {ch}
        </LightChar>
      ))}
    </>
  );
}

function LightChar({
  progress,
  index,
  total,
  children,
}: {
  progress: MotionValue<number>;
  index: number;
  total: number;
  children: string;
}) {
  const start = (index / total) * 0.7;
  const opacity = useTransform(progress, (p) =>
    p <= start ? 0.1 : p >= start + 0.3 ? 1 : 0.1 + (ramp(p, start, start + 0.3) * 0.9)
  );
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {children}
    </motion.span>
  );
}

function TechStack() {
  const ref = useRef<HTMLDivElement>(null);
  // Long window — the reveal rides nearly the section's whole trip up the
  // viewport, so the chars light up slowly like the About statement
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 1", "start 0"],
  });
  const [l1, l2] = SERVICES_PAGE.stackHeading;
  const total = l1.length + l2.length;
  const noteOpacity = useTransform(scrollYProgress, (p) => ramp(p, 0.72, 0.95));
  const noteY = useTransform(scrollYProgress, (p) => (1 - ramp(p, 0.72, 0.95)) * 20);

  return (
    <section className="pt-[clamp(110px,15.28vw,231px)]">
      <h2 className="sr-only">{`${l1} ${l2}`}</h2>
      {/* Scroll target is the heading block itself (not the padded section),
          so the char reveal spans its ENTIRE climb up the viewport */}
      <div
        ref={ref}
        aria-hidden="true"
        className="font-serif-luxury text-[clamp(40px,9.37vw,141.6px)] leading-[0.7] text-[#741a14]"
      >
        {/* TECHNOLOGY — left edge 18.52% (x=280) */}
        <p className="pl-[8%] whitespace-nowrap lg:pl-[18.52%]">
          <LightChars progress={scrollYProgress} text={l1} from={0} total={total} />
        </p>
        {/* STACK at 58.6% (x=886) with the note beside it (15:9023) */}
        <div className="relative mt-[clamp(8px,0.86vw,13px)]">
          <p className="pl-[24%] whitespace-nowrap lg:pl-[58.6%]">
            <LightChars progress={scrollYProgress} text={l2} from={l1.length} total={total} />
          </p>
          <motion.p
            style={{ opacity: noteOpacity, y: noteY }}
            className="mt-6 pl-[8%] font-sans-luxury text-[clamp(13px,1.06vw,16px)] font-bold uppercase leading-[1.5] text-black lg:absolute lg:bottom-0 lg:mt-0 lg:w-[20.63%] lg:pl-0 lg:left-[34.52%]"
          >
            {SERVICES_PAGE.stackNote}
          </motion.p>
        </div>
      </div>
    </section>
  );
}

/* ————— Numbered capability accordion (Figma 16:90xx) — Red Hat Bold 32
   number + title, platforms 18px, core list 15px. ————— */
function CapabilityAccordion() {
  const [open, setOpen] = useState(0);

  return (
    <section className="mx-[0.4%] pt-[clamp(64px,7.8vw,118px)]">
      {SERVICES_PAGE.capabilities.map((c, i) => {
        const isOpen = open === i;
        return (
          <div key={c.n} className="border-t border-black/30 last:border-b">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="grid w-full cursor-pointer grid-cols-[40px_1fr_32px] items-center gap-2 py-[clamp(24px,2.8vw,43px)] pl-[1.85%] pr-[2.38%] text-left lg:grid-cols-[32.28%_1fr_48px]"
            >
              <span className="font-sans-luxury text-[clamp(20px,2.12vw,32px)] font-bold leading-[0.85] text-black">
                {c.n}
              </span>
              <span className="font-sans-luxury text-[clamp(20px,2.12vw,32px)] font-bold leading-[0.85] text-black">
                {c.title}
              </span>
              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                className="justify-self-end font-sans-luxury text-[18px] text-black"
                aria-hidden="true"
              >
                ↓
              </motion.span>
            </button>

            <motion.div
              initial={false}
              animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="pb-[clamp(28px,3.1vw,47px)] pl-[1.85%] pr-[2.38%] lg:pl-[34.13%]">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-[47%_1fr]">
                  <div>
                    <span className="font-sans-luxury text-[clamp(13px,1.06vw,16px)] font-bold uppercase leading-[16.88px] text-black">
                      {c.platformsLabel}
                    </span>
                    <ul className="mt-[clamp(10px,1.2vw,18px)] flex flex-col">
                      {c.platforms.map((p) => (
                        <li
                          key={p}
                          className="font-sans-luxury text-[clamp(14px,1.19vw,18px)] leading-normal text-black"
                        >
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="font-sans-luxury text-[clamp(13px,1.06vw,16px)] font-bold uppercase leading-[16.88px] text-black">
                      {c.coreLabel}
                    </span>
                    <ul className="mt-[clamp(10px,1.2vw,18px)] flex flex-col gap-[4px]">
                      {c.core.map((p) => (
                        <li
                          key={p}
                          className="font-sans-luxury text-[clamp(12px,0.99vw,15px)] leading-normal text-black"
                        >
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        );
      })}
    </section>
  );
}

/* ————— OUR PROCESS / How we work (Figma 17:90xx-18:91xx): the screen PINS
   here and YOUR SCROLL is what loads the scene — the rule draws left→right
   with a small spinning ✦ riding its tip, planting a ✦ stop at each column
   whose arrival reveals that step (label → title → body de-blurring in).
   The pin releases and the page scrolls on ONLY once the show is complete;
   scrolling back up rewinds it. A spring smooths the scrub so wheel flicks
   read as fluid motion instead of jumps. ————— */
const STAR_STOPS = [0.1218, 0.3993, 0.6768, 0.9542];

function ProcessStep({
  progress,
  index,
  step,
}: {
  progress: MotionValue<number>;
  index: number;
  step: (typeof SERVICES_PAGE.steps)[number];
}) {
  // Reveal starts the moment the line tip reaches this column's ✦ stop
  const f = STAR_STOPS[index];
  const labelOpacity = useTransform(progress, (p) => ramp(p, f, f + 0.06));
  const labelY = useTransform(progress, (p) => (1 - ramp(p, f, f + 0.06)) * 14);
  const titleOpacity = useTransform(progress, (p) => ramp(p, f + 0.02, f + 0.1));
  const titleY = useTransform(progress, (p) => (1 - ramp(p, f + 0.02, f + 0.1)) * 14);
  // Body: slow faint→full fade with de-blur (~0.8s), like the capture
  const bodyOpacity = useTransform(progress, (p) => 0.1 + ramp(p, f + 0.04, f + 0.26) * 0.9);
  const bodyY = useTransform(progress, (p) => (1 - ramp(p, f + 0.04, f + 0.26)) * 10);
  const bodyBlur = useTransform(
    progress,
    (p) => `blur(${(1 - ramp(p, f + 0.04, f + 0.26)) * 5}px)`
  );

  return (
    <div>
      <motion.p
        style={{ opacity: labelOpacity, y: labelY }}
        className="font-sans-luxury text-[14px] font-bold uppercase leading-[16.88px] tracking-[-0.337px] text-black"
      >
        {step.step}
      </motion.p>
      <motion.h3
        style={{ opacity: titleOpacity, y: titleY }}
        className="mt-[clamp(20px,2.9vw,44px)] font-serif-luxury text-[clamp(24px,2.12vw,32px)] font-normal leading-normal text-black"
      >
        {step.title}
      </motion.h3>
      <motion.p
        style={{ opacity: bodyOpacity, y: bodyY, filter: bodyBlur }}
        className="mt-[clamp(12px,1.92vw,29px)] font-sans-luxury text-[clamp(14px,1.19vw,18px)] leading-normal text-black"
      >
        {step.body}
      </motion.p>
    </div>
  );
}

function ProcessStar({
  progress,
  stop,
}: {
  progress: MotionValue<number>;
  stop: number;
}) {
  // Plants (quick pop) exactly when the travelling tip passes this stop
  const opacity = useTransform(progress, (p) => ramp(p, stop - 0.005, stop + 0.02));
  const scale = useTransform(progress, (p) => 0.4 + ramp(p, stop - 0.005, stop + 0.02) * 0.6);
  return (
    <motion.img
      src="/figma/about/star-maroon.svg"
      alt=""
      aria-hidden="true"
      style={{ opacity, scale, left: `${stop * 100}%` }}
      className="absolute top-1/2 w-[21px] -translate-x-1/2 -translate-y-1/2"
    />
  );
}

function ProcessSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Pin runway (desktop): 100vh pinned screen + 250vh of scroll that drives
  // the show. On small screens the wrapper has no extra height, so the same
  // scrub simply rides the section's own travel through the viewport.
  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 40,
    damping: 17,
    restDelta: 0.001,
  });
  // Show completes at 90% of the runway — the finished scene dwells a beat
  // before the pin releases and the page scrolls on
  const progress = useTransform(smooth, (p) => ramp(p, 0, 0.9));

  const tipLeft = useTransform(progress, (p) => `${Math.min(p, 1) * 100}%`);
  // Tip: spins while travelling (reads ×/+/× like the capture), then hands
  // off into the final ✦ stop and fades
  const tipRotate = useTransform(progress, (p) => 45 + p * 450);
  const tipOpacity = useTransform(progress, (p) =>
    p < 0.005 ? 0 : p < 0.94 ? 1 : 1 - ramp(p, 0.94, 0.985)
  );

  return (
    <section className="relative pt-[clamp(64px,8vw,120px)] pb-[clamp(96px,10vw,150px)]">
      <div ref={wrapRef} className="relative lg:h-[800vh]">
        <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-center lg:overflow-hidden">
          <div className="grid grid-cols-1 gap-8 pl-[8%] pr-[8%] lg:grid-cols-[16.4%_1fr] lg:gap-0 lg:pl-[2.05%] lg:pr-[6.08%]">
            <div>
              <Reveal>
                <Eyebrow color="#000">{SERVICES_PAGE.processLabel}</Eyebrow>
              </Reveal>
            </div>
            <div>
              <Reveal>
                <h2 className="font-serif-luxury text-[clamp(44px,5.29vw,80px)] font-normal leading-normal text-[#741a14]">
                  {SERVICES_PAGE.processHeading}
                </h2>
                <p className="mt-[clamp(6px,0.6vw,9px)] max-w-[249px] font-sans-luxury text-[clamp(14px,1.19vw,18px)] leading-normal text-black">
                  {SERVICES_PAGE.processIntro}
                </p>
              </Reveal>

              <div className="mt-[clamp(40px,5.09vw,77px)] grid grid-cols-1 gap-y-12 md:grid-cols-3 md:gap-x-[2.7%]">
                {SERVICES_PAGE.steps.map((s, i) => (
                  <ProcessStep key={s.step} progress={progress} index={i} step={s} />
                ))}
              </div>
            </div>
          </div>

          {/* Self-drawing rule with ✦ stops + spinning tip (Line 18 + Vectors) */}
          <div className="relative ml-[7.87%] mt-[clamp(48px,6.15vw,93px)] h-[21px] w-[86.05%]">
            <motion.div
              style={{ scaleX: progress }}
              className="absolute top-1/2 h-px w-full origin-left bg-black/40"
            />
            <motion.img
              src="/figma/about/star-maroon.svg"
              alt=""
              aria-hidden="true"
              style={{ left: tipLeft, opacity: tipOpacity, rotate: tipRotate }}
              className="absolute top-1/2 w-[17px] -translate-x-1/2 -translate-y-1/2"
            />
            {STAR_STOPS.map((stop) => (
              <ProcessStar key={stop} progress={progress} stop={stop} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ServicesBody() {
  return (
    <div className="bg-[#fff3d3] text-black">
      <ServicesHero />
      <ServicePanels />
      <TechStack />
      <CapabilityAccordion />
      <ProcessSection />
    </div>
  );
}
