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
    <article
      ref={ref}
      className="relative grid grid-cols-1 items-center gap-8 py-[clamp(56px,7vw,110px)] lg:grid-cols-2 lg:gap-[6%]"
    >
      {/* Ghost wordmark */}
      <motion.span
        aria-hidden="true"
        style={{ y: ghostY, opacity: ghostOpacity }}
        className="pointer-events-none absolute inset-x-0 top-0 select-none text-center font-serif-luxury text-[clamp(64px,11vw,168px)] uppercase leading-none tracking-[-0.02em] text-[#fff3d3]"
      >
        {project.title}
      </motion.span>

      {/* Info column */}
      <Reveal className={`relative z-10 ${flipped ? "lg:order-2 lg:pl-[8%]" : "lg:order-1"}`}>
        <h3 className="font-sans-luxury text-[clamp(22px,2.1vw,32px)] font-bold leading-[1.08] text-[#fff3d3]">
          {project.title}
        </h3>
        <p className="mt-3 max-w-[300px] whitespace-pre-line font-sans-luxury text-[14px] leading-snug text-white">
          {project.description}
        </p>
        <UnderlineLink
          label={WORK_PAGE.exploreCta}
          href={`/work/${project.id}`}
          width="191px"
          className="mt-7"
          color="#fff3d3"
          arrow="/figma/arrow-cream.svg"
        />
      </Reveal>

      {/* Image with clip reveal + parallax */}
      <div className={`relative z-10 ${flipped ? "lg:order-1" : "lg:order-2"}`}>
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

  // Two clearly separated strands: the companion arcs ~45 units away and is
  // deliberately SHORTER (starts after the departure, releases before the
  // landing) so the pair reads as two lines instead of one thick one.
  const MAIN = "M 790 8 C 1010 128, 560 148, 452 210 C 344 272, 250 300, 208 394";
  const TWIN = "M 842 62 C 992 158, 636 186, 540 236 C 452 282, 392 306, 338 358";

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none relative z-0 -my-[clamp(48px,6vw,96px)] hidden h-[clamp(160px,20vw,300px)] lg:block"
    >
      <svg
        viewBox="0 0 1000 400"
        fill="none"
        preserveAspectRatio="none"
        className={`h-full w-full ${flip ? "-scale-x-100" : ""}`}
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-30" y="-50" width="1060" height="500">
            <motion.path
              d={MAIN}
              stroke="#fff"
              strokeWidth="34"
              strokeLinecap="round"
              fill="none"
              style={{ pathLength: smooth }}
            />
          </mask>
          <mask id={`${maskId}-b`} maskUnits="userSpaceOnUse" x="-30" y="-50" width="1060" height="500">
            <motion.path
              d={TWIN}
              stroke="#fff"
              strokeWidth="34"
              strokeLinecap="round"
              fill="none"
              style={{ pathLength: twinProgress }}
            />
          </mask>
        </defs>
        {/* main strand */}
        <g mask={`url(#${maskId})`}>
          <path
            d={MAIN}
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
        <g mask={`url(#${maskId}-b)`}>
          <path
            d={TWIN}
            pathLength={1000}
            stroke="#fff3d3"
            strokeOpacity="0.45"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeDasharray="0.5 11"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      {/* the main strand lands on a star */}
      <motion.img
        src="/figma/star-hero.svg"
        alt=""
        style={{ opacity: starOpacity, scale: starScale }}
        className={`absolute bottom-[1.5%] w-[22px] translate-y-1/2 ${
          flip ? "right-[20.8%] translate-x-1/2" : "left-[20.8%] -translate-x-1/2"
        }`}
      />
    </div>
  );
}

export default function WorkGrid() {
  return (
    // transparent — the page-level reddish gradient runs uninterrupted
    <section className="px-[6%] pb-[clamp(80px,10vw,150px)] pt-[clamp(48px,6vw,90px)]">
      {WORK_PAGE.projects.map((p, i) => (
        <div key={p.id}>
          <ProjectEntry project={p} index={i} />
          {i < WORK_PAGE.projects.length - 1 ? <Connector flip={i % 2 === 1} uid={p.id} /> : null}
        </div>
      ))}

      <Reveal className="mt-[clamp(48px,6vw,90px)] flex justify-center">
        <UnderlineLink label={WORK_PAGE.cta} href="/about" width="191px" color="#fff3d3" arrow="/figma/arrow-cream.svg" />
      </Reveal>
    </section>
  );
}
