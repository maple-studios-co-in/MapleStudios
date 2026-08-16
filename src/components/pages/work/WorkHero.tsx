"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import MapleOutlineMark from "@/components/common/MapleOutlineMark";
import { WORK_PAGE } from "@/lib/constants";

/**
 * "Our work" hero — trionn.com/work behaviour: MANY small project thumbnails
 * of varied sizes FLOW freely across the whole dark viewport — each wanders
 * through its own loop of waypoints (position + rotation, long out-of-phase
 * durations, so the field never looks synchronized) — and on scroll each one
 * is flung OUTWARD, away from the title, scattering off screen while fading.
 *
 * Images mix Selected-work card art with visually rich slices from the
 * case-study PDF decks (Get Shoku / Maple Furnishers / Maple Lens).
 */
const THUMBS = [
  // 9 cards on wide edge lanes. Full prior drift speeds, but each wanders
  // mostly away from neighbours so float paths stay collision-free.
  // Centre (~28–68% x, ~28–62% y) stays clear for the title.
  {
    left: "3%",
    top: "8%",
    size: 10,
    rotate: -7,
    dur: 14,
    wx: [0, 6, -3, 0],
    wy: [0, 7, -4, 0],
    image: WORK_PAGE.projects[0].image, // Get Shoku
  },
  {
    left: "42%",
    top: "4%",
    size: 8,
    rotate: -4,
    dur: 16,
    wx: [0, 5, -6, 0],
    wy: [0, 5, 2, 0],
    image: "/work/my-worker-ai/deck-v1/slice-08.webp",
  },
  {
    left: "82%",
    top: "8%",
    size: 10,
    rotate: 6,
    dur: 17,
    wx: [0, -7, 4, 0],
    wy: [0, 8, -3, 0],
    image: "/work/loftgoom/deck-v1/slice-02.webp",
  },
  {
    left: "2%",
    top: "40%",
    size: 9,
    rotate: -6,
    dur: 18,
    wx: [0, 6, -3, 0],
    wy: [0, -6, 5, 0],
    image: "/work/pulse-studio/deck-v1/slice-04.webp",
  },
  {
    left: "88%",
    top: "38%",
    size: 9,
    rotate: 5,
    dur: 15.5,
    wx: [0, -6, 3, 0],
    wy: [0, 6, -5, 0],
    image: WORK_PAGE.projects[3].image, // Maple Lens
  },
  {
    left: "4%",
    top: "72%",
    size: 10,
    rotate: 7,
    dur: 15,
    wx: [0, 7, -4, 0],
    wy: [0, -7, -2, 0],
    image: WORK_PAGE.projects[2].image, // Maple Furnishers
  },
  {
    left: "44%",
    top: "80%",
    size: 8.5,
    rotate: -5,
    dur: 16.5,
    wx: [0, -5, 6, 0],
    wy: [0, -5, 3, 0],
    image: "/work/loftgoom/deck-v1/slice-05.webp",
  },
  {
    left: "78%",
    top: "70%",
    size: 9.5,
    rotate: -5,
    dur: 18,
    wx: [0, -6, 5, 0],
    wy: [0, -8, 4, 0],
    image: WORK_PAGE.projects[1].image, // Ecommerce
  },
  {
    left: "90%",
    top: "78%",
    size: 7.5,
    rotate: 6,
    dur: 17.5,
    wx: [0, -4, 2, 0],
    wy: [0, -6, 3, 0],
    image: WORK_PAGE.projects[4].image, // Kalaa Kaari
  },
];

function FloatingThumb({
  progress,
  spec,
}: {
  progress: MotionValue<number>;
  spec: (typeof THUMBS)[number];
}) {
  // Fling each thumb AWAY from the hero centre as it scrolls out.
  const dx = (parseFloat(spec.left) - 50) * 1.7;
  const dy = (parseFloat(spec.top) - 45) * 2.1;
  const x = useTransform(progress, [0, 0.75], ["0vw", `${dx}vw`]);
  const y = useTransform(progress, [0, 0.75], ["0vh", `${dy}vh`]);
  const opacity = useTransform(progress, [0, 0.45, 0.72], [1, 0.85, 0]);
  const rotate = useTransform(progress, [0, 0.75], [spec.rotate, spec.rotate * 3]);

  return (
    <motion.div
      style={{ left: spec.left, top: spec.top, x, y, opacity, rotate, width: `clamp(56px,${spec.size}vw,160px)` }}
      className="absolute z-0 will-change-transform"
    >
      {/* free-flow wandering lives on an inner node so it composes with the
          scroll fling: each card drifts through its own waypoint loop */}
      <motion.div
        animate={{
          x: spec.wx.map((v) => `${v}vw`),
          y: spec.wy.map((v) => `${v}vh`),
          rotate: [0, spec.rotate * 0.6, -spec.rotate * 0.4, 0],
        }}
        transition={{ duration: spec.dur, ease: "easeInOut", repeat: Infinity }}
        className="relative aspect-[810/556] w-full overflow-hidden rounded-[5px] shadow-2xl"
      >
        <Image src={spec.image} alt="" fill sizes="160px" className="object-cover" />
      </motion.div>
    </motion.div>
  );
}

export default function WorkHero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  return (
    // transparent — the page-level fixed reddish gradient shows through
    <section
      ref={ref}
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      {THUMBS.map((t, i) => (
        <FloatingThumb key={`${t.image}-${i}`} progress={scrollYProgress} spec={t} />
      ))}

      {/* Outline M + star above the title (user-supplied 280x182 mark) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="relative z-10"
      >
        <MapleOutlineMark className="mx-auto w-[max(120px,14.8vw)]" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.1 }}
        className="relative z-10 mt-[max(20px,2.6vw)] font-serif-luxury text-[max(56px,6.61vw)] font-normal leading-normal text-[#fff3d3]"
      >
        {WORK_PAGE.hero.title}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.25 }}
        className="relative z-10 mt-4 max-w-[430px] font-sans-luxury text-[max(14px,1.19vw)] leading-normal text-white"
      >
        {WORK_PAGE.hero.subtitle}
      </motion.p>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.8 }}
        className="relative z-10 mt-12 size-[max(20px,1.323vw)]"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/scroll-circle.svg" alt="" className="absolute inset-0 size-full" />
        <motion.span
          animate={{ y: [0, 3.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/figma/arrow-down-sm.svg" alt="" className="w-[max(7.8px,0.516vw)] rotate-90" />
        </motion.span>
      </motion.div>
    </section>
  );
}
