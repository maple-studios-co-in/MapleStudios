"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { WORK_PAGE } from "@/lib/constants";
import { Reveal, UnderlineLink } from "../PageKit";

/**
 * Project entry — trionn.com/work reveal:
 *  • a giant "ghost" wordmark of the project name sits behind the block,
 *  • the info column (title / description / EXPLORE PROJECT) is on the left,
 *  • the image reveals through a clip that opens as it enters the viewport
 *    while the picture itself counter-translates (parallax), so the frame
 *    grows and the image drifts inside it.
 * Odd rows mirror the layout so the column stagger alternates.
 */
function ProjectEntry({
  project,
  index,
}: {
  project: (typeof WORK_PAGE.projects)[number];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.95", "end 0.25"],
  });

  // Clip opens from a thin slit to the full frame.
  const clip = useTransform(scrollYProgress, [0, 0.55], ["inset(38% 0% 38% 0%)", "inset(0% 0% 0% 0%)"]);
  // Slight zoom that settles to an EXACT fit — the card aspect matches the
  // artwork (810/556 ≈ 1480/1016), so at rest nothing is cropped: the full
  // "Hi, I'm Alex." frame stays visible. (An earlier ±10% overscan parallax
  // permanently cut the bottom of the art.)
  const scale = useTransform(scrollYProgress, [0, 0.55], [1.06, 1]);
  // Ghost wordmark parallax
  const ghostY = useTransform(scrollYProgress, [0, 1], [40, -60]);
  const ghostOpacity = useTransform(scrollYProgress, [0, 0.35, 0.8], [0, 0.13, 0.06]);

  const flipped = index % 2 === 1;

  return (
    // Phones: IMAGE first, its copy directly below (trionn's mobile order —
    // the old text-first stack paired each title with the PREVIOUS entry's
    // image on screen), and a tighter 28px band per entry so description and
    // the next card sit close. Desktop zigzag unchanged.
    <article
      ref={ref}
      className="relative grid grid-cols-1 items-center gap-5 py-[28px] lg:grid-cols-2 lg:gap-[6%] lg:py-[max(56px,7vw)]"
    >
      {/* Ghost wordmark */}
      <motion.span
        aria-hidden="true"
        style={{ y: ghostY, opacity: ghostOpacity }}
        className="pointer-events-none absolute inset-x-0 top-0 select-none overflow-hidden text-center font-serif-luxury text-[max(38px,11vw)] uppercase leading-none tracking-[-0.02em] text-[#fff3d3]"
      >
        {project.title}
      </motion.span>

      {/* Info column */}
      <Reveal className={`relative z-10 order-2 ${flipped ? "lg:order-2 lg:pl-[8%]" : "lg:order-1"}`}>
        <h3 className="font-sans-luxury text-[max(22px,2.1vw)] font-bold leading-[1.08] text-[#fff3d3]">
          {project.title}
        </h3>
        <p className="mt-3 max-w-[300px] whitespace-pre-line font-sans-luxury text-[max(14px,0.926vw)] leading-snug text-white">
          {project.description}
        </p>
        <UnderlineLink
          label={WORK_PAGE.exploreCta}
          href={`/work/${project.id}`}
          width="max(191px,12.632vw)"
          className="mt-7"
          color="#fff3d3"
          arrow="/figma/arrow-cream.svg"
        />
      </Reveal>

      {/* Image with clip reveal + parallax */}
      <div className={`relative z-10 order-1 ${flipped ? "lg:order-1" : "lg:order-2"}`}>
        <Link
          href={`/work/${project.id}`}
          aria-label={project.title}
          className="group block transition-transform duration-500 hover:-translate-y-1"
        >
          <motion.div
            style={{ clipPath: clip }}
            className="relative aspect-[810/556] w-full overflow-hidden rounded-[6px]"
          >
            <motion.div style={{ scale }} className="absolute inset-0">
              <Image
                src={project.image}
                alt={project.title}
                fill
                sizes="(min-width: 1024px) 46vw, 92vw"
                className="object-cover"
              />
            </motion.div>
          </motion.div>
        </Link>
      </div>
    </article>
  );
}

/**
 * Card-to-card connector, matched to trionn.com/work: TWO fine DOTTED strands
 * travelling together along an S-curve, gradually revealed toward the next
 * card as the gap scrolls through the viewport.
 *
 * Technique: motion's `pathLength` animation owns `stroke-dasharray`, so a
 * dotted pattern can't be draw-animated directly. Instead the dotted pair is
 * STATIC and sits inside an SVG <mask> whose hidden wide stroke draws along
 * the same curve (pathLength 0 → 1) — progressively uncovering both strands
 * with one synchronized tip. `pathLength={1000}` on the dotted paths keeps the
 * dot spacing uniform along the curve despite the stretched viewBox.
 */
function Connector({ flip, uid }: { flip: boolean; uid: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // visible dotted main paths — sampled for the travelling spark's position
  const deskPathRef = useRef<SVGPathElement>(null);
  const mobPathRef = useRef<SVGPathElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.98", "end 0.3"],
  });
  // Spring so the draw glides between scroll events instead of stepping.
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 24, restDelta: 0.001 });
  // The companion strand trails behind the main one.
  const twinProgress = useTransform(smooth, [0.16, 0.96], [0, 1]);
  const starOpacity = useTransform(smooth, [0.8, 0.97], [0, 1]);
  const starScale = useTransform(smooth, [0.8, 0.97], [0.4, 1]);
  const maskId = `connMask-${uid}`;

  /* ——— travelling SPARK (trionn's work-page tip): a small glowing ✦ rides
     the drawing tip along the curve. Position comes from sampling the real
     path geometry (getPointAtLength) each frame and mapping the viewBox
     point to a % of the stretched container; the svg may be CSS-mirrored
     (`flip`), so x mirrors with it. Spins as it travels, and hands off into
     the landing star at the end. ——— */
  const tipAt = (pathRef: React.RefObject<SVGPathElement | null>, vbW: number, vbH: number) => {
    const point = (s: number) => {
      const p = pathRef.current;
      if (!p) return { x: 0, y: 0 };
      return p.getPointAtLength(Math.max(0, Math.min(1, s)) * p.getTotalLength());
    };
    return { point, vbW, vbH };
  };
  const deskTip = tipAt(deskPathRef, 1000, 400);
  const mobTip = tipAt(mobPathRef, 375, 430);
  const deskTipLeft = useTransform(smooth, (s) => {
    const xf = (deskTip.point(s).x / deskTip.vbW) * 100;
    return `${flip ? 100 - xf : xf}%`;
  });
  const deskTipTop = useTransform(smooth, (s) => `${(deskTip.point(s).y / deskTip.vbH) * 100}%`);
  const mobTipLeft = useTransform(smooth, (s) => {
    const xf = (mobTip.point(s).x / mobTip.vbW) * 100;
    return `${flip ? 100 - xf : xf}%`;
  });
  const mobTipTop = useTransform(smooth, (s) => `${(mobTip.point(s).y / mobTip.vbH) * 100}%`);
  const tipOpacity = useTransform(smooth, [0, 0.04, 0.9, 0.99], [0, 1, 1, 0]);
  const tipRotate = useTransform(smooth, (s) => 45 + s * 540);

  // Two clearly separated strands: the companion arcs ~45 units away and is
  // deliberately SHORTER (starts after the departure, releases before the
  // landing) so the pair reads as two lines instead of one thick one.
  const MAIN = "M 790 8 C 1010 128, 560 148, 452 210 C 344 272, 250 300, 208 394";
  const TWIN = "M 842 62 C 992 158, 636 186, 540 236 C 452 282, 392 306, 338 358";
  // Mobile pair (trionn's phone layout keeps the strands): the container
  // overlaps the WHOLE text block above (-mt-230), so the strand departs
  // from the IMAGE CARD's bottom-right corner, runs down the right side of
  // the copy, and bows once — a single gentle curve, no S-turns — to land
  // centred above the next card.
  const MAIN_M = "M 300 4 C 330 150, 165 300, 188 428";
  const TWIN_M = "M 330 44 C 344 175, 205 300, 210 416";

  const strands = (
    main: string,
    twin: string,
    idSuffix: string,
    mainRef?: React.RefObject<SVGPathElement | null>
  ) => (
    <>
      <defs>
        <mask id={`${maskId}${idSuffix}`} maskUnits="userSpaceOnUse" x="-30" y="-50" width="1060" height="520">
          <motion.path
            d={main}
            stroke="#fff"
            strokeWidth="34"
            strokeLinecap="round"
            fill="none"
            style={{ pathLength: smooth }}
          />
        </mask>
        <mask id={`${maskId}${idSuffix}-b`} maskUnits="userSpaceOnUse" x="-30" y="-50" width="1060" height="520">
          <motion.path
            d={twin}
            stroke="#fff"
            strokeWidth="34"
            strokeLinecap="round"
            fill="none"
            style={{ pathLength: twinProgress }}
          />
        </mask>
      </defs>
      {/* main strand */}
      <g mask={`url(#${maskId}${idSuffix})`}>
        <path
          ref={mainRef}
          d={main}
          pathLength={1000}
          stroke="#fff3d3"
          strokeOpacity="0.92"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="0.6 8.4"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      {/* shorter companion strand, trailing behind */}
      <g mask={`url(#${maskId}${idSuffix}-b)`}>
        <path
          d={twin}
          pathLength={1000}
          stroke="#fff3d3"
          strokeOpacity="0.45"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="0.5 11"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </>
  );

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none relative z-0 -mt-[230px] -mb-[10px] block h-[430px] lg:-my-[max(48px,6vw)] lg:h-[max(160px,20vw)]"
    >
      {/* desktop S-curve spanning the zigzag */}
      <svg
        viewBox="0 0 1000 400"
        fill="none"
        preserveAspectRatio="none"
        className={`hidden h-full w-full lg:block ${flip ? "-scale-x-100" : ""}`}
      >
        {strands(MAIN, TWIN, "", deskPathRef)}
      </svg>
      {/* mobile strand between the stacked entries */}
      <svg
        viewBox="0 0 375 430"
        fill="none"
        preserveAspectRatio="none"
        className={`h-full w-full lg:hidden ${flip ? "-scale-x-100" : ""}`}
      >
        {strands(MAIN_M, TWIN_M, "-m", mobPathRef)}
      </svg>
      {/* glowing ✦ spark riding the drawing tip (one per breakpoint).
          Centring lives in motion's x/y (NOT Tailwind translate classes —
          motion owns the transform and would overwrite them). */}
      <motion.img
        src="/figma/star-hero.svg"
        alt=""
        style={{ left: deskTipLeft, top: deskTipTop, opacity: tipOpacity, rotate: tipRotate, x: "-50%", y: "-50%" }}
        className="absolute hidden w-[15px] [filter:drop-shadow(0_0_7px_rgba(255,243,211,0.95))] lg:block"
      />
      <motion.img
        src="/figma/star-hero.svg"
        alt=""
        style={{ left: mobTipLeft, top: mobTipTop, opacity: tipOpacity, rotate: tipRotate, x: "-50%", y: "-50%" }}
        className="absolute w-[13px] [filter:drop-shadow(0_0_6px_rgba(255,243,211,0.95))] lg:hidden"
      />
      {/* the main strand lands on a star */}
      <motion.img
        src="/figma/star-hero.svg"
        alt=""
        style={{ opacity: starOpacity, scale: starScale }}
        className={`absolute hidden w-[22px] translate-y-1/2 lg:block ${
          flip ? "bottom-[1.5%] right-[20.8%] translate-x-1/2" : "bottom-[1.5%] left-[20.8%] -translate-x-1/2"
        }`}
      />
      <motion.img
        src="/figma/star-hero.svg"
        alt=""
        style={{ opacity: starOpacity, scale: starScale }}
        className={`absolute bottom-0 w-[16px] translate-y-1/2 lg:hidden ${
          flip ? "right-1/2 translate-x-1/2" : "left-1/2 -translate-x-1/2"
        }`}
      />
    </div>
  );
}

export default function WorkGrid() {
  return (
    // transparent — the page-level reddish gradient runs uninterrupted
    <section className="px-[6%] pb-[max(80px,10vw)] pt-[max(48px,6vw)]">
      {WORK_PAGE.projects.map((p, i) => (
        <div key={p.id}>
          <ProjectEntry project={p} index={i} />
          {i < WORK_PAGE.projects.length - 1 ? <Connector flip={i % 2 === 1} uid={p.id} /> : null}
        </div>
      ))}

      <Reveal className="mt-[max(48px,6vw)] flex justify-center">
        <UnderlineLink label={WORK_PAGE.cta} href="/about" width="max(191px,12.632vw)" color="#fff3d3" arrow="/figma/arrow-cream.svg" />
      </Reveal>
    </section>
  );
}
