"use client";

import { motion } from "motion/react";
import { HERO_DATA } from "@/lib/constants";
import MapleMark from "@/components/common/MapleMark";
import GradientCycler from "@/components/common/GradientCycler";

/**
 * Hero — Figma node 120:980 (canvas 1512 x 797).
 * All absolute positions are % of that canvas so the layout scales.
 */
export default function HeroSection() {
  return (
    <section
      id="hero"
      className="relative isolate min-h-svh overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)",
      }}
    >
      {/* Auto-cycling gradient shades */}
      <GradientCycler />

      {/* Continuous breathing gradient — a lighter red that drifts and pulses */}
      <div
        aria-hidden="true"
        className="hero-glow pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(48% 90% at 46% 55%, rgba(190,62,45,0.55) 0%, rgba(139,42,32,0.32) 42%, transparent 74%)",
        }}
      />

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

      {/* ——— Glassy wireframe M ———
          Sized per the Figma inspect (left 472 / top 140 / right 469 / bottom 285
          on the 1512x797 canvas = centered x, center-y 40.9%, width 572).
          Sits ABOVE the headline (z-20): fully transparent glass, so the "se."
          of "purpose." stays readable through it, exactly like the design. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.3, ease: "easeOut" }}
        className="absolute left-1/2 top-[40.9%] z-20 w-[clamp(300px,37.83vw,572px)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      >
        <motion.div
          animate={{ y: [0, -26, 0], rotate: [0, 1.4, 0] }}
          transition={{ duration: 5.5, ease: "easeInOut", repeat: Infinity }}
        >
          <MapleMark className="h-auto w-full" />
        </motion.div>
      </motion.div>

      {/* Little 4-point star sparkle (Figma 47:1042 — 2s rotation loop) */}
      <motion.img
        src="/figma/star-hero.svg"
        alt=""
        initial={{ rotate: -360 }}
        animate={{ rotate: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 2, repeat: Infinity, repeatDelay: 1.6 }}
        className="absolute left-[28.09%] top-[52.06%] w-[clamp(13px,1.37vw,21px)] pointer-events-none select-none"
      />

      {/* Tiny glass orb over the headline (as in Figma render) */}
      <div
        className="absolute left-[35.9%] top-[28.6%] size-[clamp(26px,3vw,46px)] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,243,211,0.22), rgba(255,243,211,0.04) 55%, transparent 75%)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
        aria-hidden="true"
      />

      {/* ——— Headline + START A PROJECT (one anchored block, top-left) ———
          Heading enlarged to the design's span so the "se." of "purpose."
          tucks under the glass M; the CTA is anchored below it so they can
          never collide at short viewports. */}
      <div className="absolute left-[1.85%] top-[17.2%] z-10">
        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="font-serif-luxury text-[#fff3d3] text-[clamp(42px,5.29vw,80px)] font-normal leading-[1.11] tracking-[0.05em] whitespace-nowrap"
        >
          <span className="block">{HERO_DATA.headlineMain}</span>
          <span className="block">{HERO_DATA.headlineSub}</span>
        </motion.h1>

        <motion.a
          href="#contact"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="group ml-[0.5%] mt-[clamp(20px,2.2vw,34px)] flex w-[clamp(150px,12.63vw,191px)] flex-col"
        >
          <span className="flex items-center justify-between">
            <span className="font-sans-luxury text-[clamp(12px,0.93vw,14px)] font-bold uppercase tracking-[-0.024em] text-[#fff3d3]">
              {HERO_DATA.cta}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figma/arrow-cream.svg"
              alt=""
              className="w-[15px] transition-transform duration-300 group-hover:translate-x-1"
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
        className="absolute left-[81.02%] top-[48.56%] z-10 w-[clamp(190px,14.42vw,218px)] max-md:left-auto max-md:right-[4%] max-md:top-[34%]"
      >
        <div className="flex aspect-[218/79] w-full overflow-hidden rounded-[4px] border border-white">
          <div className="flex w-[46.79%] flex-col items-center justify-center rounded-[4px] bg-[#fff3d3] text-[#741a14]">
            <span className="font-sans-luxury text-[clamp(15px,1.27vw,19.1px)] font-bold leading-[1.4]">
              {HERO_DATA.badge.hours}
            </span>
            <span className="font-sans-luxury text-[clamp(10px,0.95vw,14.4px)] font-normal leading-[1.3] tracking-[0.133em]">
              {HERO_DATA.badge.label}
            </span>
          </div>
          <div className="flex flex-1 items-center pl-[6.4%]">
            <span className="font-sans-luxury text-[clamp(8px,0.73vw,11px)] font-medium uppercase leading-[1.5] text-white">
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
        className="absolute left-[81.02%] top-[72.4%] z-10 w-[16.47%] min-w-[200px] -translate-y-1/2 font-sans-luxury text-[clamp(13px,1.19vw,18px)] leading-[1.35] text-white max-md:left-auto max-md:right-[6%] max-md:top-[85%] max-md:w-[min(280px,60vw)]"
      >
        {HERO_DATA.subtitle}
      </motion.p>

      {/* ——— Scroll-down indicator (bottom-left, Figma 10:7505/7506) ——— */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute left-[2.18%] top-[73.4%] z-10 size-[20px]"
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
          <img src="/figma/arrow-down-sm.svg" alt="" className="w-[7.8px] rotate-90" />
        </motion.span>
      </motion.div>

      {/* ——— Bottom corner ornaments (from bg component 91:58) ——— */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/figma/hero-corner-left.svg"
        alt=""
        className="absolute left-[7.2%] top-[81.43%] w-[clamp(26px,2.64vw,40px)] pointer-events-none select-none"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/figma/hero-corner-right.svg"
        alt=""
        className="absolute left-[90.09%] top-[81.43%] w-[clamp(26px,2.64vw,40px)] pointer-events-none select-none"
      />
    </section>
  );
}
