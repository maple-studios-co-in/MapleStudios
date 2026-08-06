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
 */
const THUMBS = [
  { left: "8%", top: "12%", size: 9.5, rotate: -8, dur: 13, wx: [0, 6, -4, 0], wy: [0, 7, -5, 0] },
  { left: "30%", top: "8%", size: 6.5, rotate: 5, dur: 17, wx: [0, -7, 5, 0], wy: [0, 9, 3, 0] },
  { left: "62%", top: "7%", size: 8, rotate: -4, dur: 15, wx: [0, 5, -6, 0], wy: [0, 6, 10, 0] },
  { left: "84%", top: "14%", size: 10.5, rotate: 7, dur: 19, wx: [0, -6, -3, 0], wy: [0, 8, -4, 0] },
  { left: "5%", top: "44%", size: 7, rotate: 6, dur: 14, wx: [0, 8, 3, 0], wy: [0, -6, 8, 0] },
  { left: "88%", top: "46%", size: 6.5, rotate: -6, dur: 16, wx: [0, -8, -4, 0], wy: [0, -7, 6, 0] },
  { left: "12%", top: "72%", size: 10, rotate: 8, dur: 18, wx: [0, 7, -5, 0], wy: [0, -9, -3, 0] },
  { left: "42%", top: "78%", size: 7.5, rotate: -5, dur: 12, wx: [0, -5, 7, 0], wy: [0, -8, -12, 0] },
  { left: "74%", top: "70%", size: 9, rotate: 5, dur: 20, wx: [0, 6, -7, 0], wy: [0, -10, 5, 0] },
];

function FloatingThumb({
  progress,
  spec,
  image,
}: {
  progress: MotionValue<number>;
  spec: (typeof THUMBS)[number];
  image: string;
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
      style={{ left: spec.left, top: spec.top, x, y, opacity, rotate, width: `clamp(64px,${spec.size}vw,170px)` }}
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
        <Image src={image} alt="" fill sizes="170px" className="object-cover" />
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
        <FloatingThumb
          key={i}
          progress={scrollYProgress}
          spec={t}
          image={WORK_PAGE.projects[i % WORK_PAGE.projects.length].image}
        />
      ))}

      {/* Outline M + star above the title (user-supplied 280x182 mark) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="relative z-10"
      >
        <MapleOutlineMark className="mx-auto w-[clamp(120px,14.8vw,224px)]" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.1 }}
        className="relative z-10 mt-[clamp(20px,2.6vw,40px)] font-serif-luxury text-[clamp(56px,6.61vw,100px)] font-normal leading-normal text-[#fff3d3]"
      >
        {WORK_PAGE.hero.title}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.25 }}
        className="relative z-10 mt-4 max-w-[430px] font-sans-luxury text-[clamp(14px,1.19vw,18px)] leading-normal text-white"
      >
        {WORK_PAGE.hero.subtitle}
      </motion.p>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.8 }}
        className="relative z-10 mt-12 size-[20px]"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/scroll-circle.svg" alt="" className="absolute inset-0 size-full" />
        <motion.img
          src="/figma/arrow-down-sm.svg"
          alt=""
          animate={{ y: [0, 2.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-1/2 w-[7.8px] -translate-x-1/2 -translate-y-1/2 rotate-90"
        />
      </motion.div>
    </section>
  );
}
