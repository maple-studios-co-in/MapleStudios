"use client";

import { motion } from "motion/react";
import GradientCycler from "@/components/common/GradientCycler";

/**
 * Shared building blocks for the inner pages (Work / Services / Contact / About).
 * Typography follows the supplied spec:
 *   Catilde 80px  -> text-[clamp(44px,5.29vw,80px)]
 *   Catilde 100px -> text-[clamp(56px,6.61vw,100px)]
 *   Catilde 141.6px, line-height 70% -> text-[clamp(56px,9.37vw,141.6px)] leading-[0.7]
 *   Red Hat 18px  -> text-[clamp(15px,1.19vw,18px)]
 */

export const HERO_GRADIENT =
  "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)";

/** Maroon page hero: centred Catilde title + Red Hat subtitle + scroll cue. */
export function PageHero({
  title,
  subtitle,
  tone = "dark",
}: {
  title: string;
  subtitle?: string;
  tone?: "dark" | "cream";
}) {
  const cream = tone === "cream";
  return (
    <section
      className="relative isolate flex min-h-[62vh] flex-col items-center justify-center overflow-hidden px-6 pb-16 pt-[clamp(140px,16vw,240px)] text-center"
      style={cream ? { background: "#fff3d3" } : { background: HERO_GRADIENT }}
    >
      {!cream ? <GradientCycler /> : null}
      <motion.h1
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9 }}
        className={`font-serif-luxury text-[clamp(44px,5.29vw,80px)] font-normal leading-normal ${
          cream ? "text-[#741a14]" : "text-[#fff3d3]"
        }`}
      >
        {title}
      </motion.h1>
      {subtitle ? (
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className={`mt-5 max-w-[430px] font-sans-luxury text-[clamp(14px,1.19vw,18px)] leading-normal ${
            cream ? "text-black" : "text-white"
          }`}
        >
          {subtitle}
        </motion.p>
      ) : null}

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.8 }}
        className="relative mt-12 size-[20px]"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cream ? "/figma/about/scroll-circle-maroon.svg" : "/figma/scroll-circle.svg"}
          alt=""
          className="absolute inset-0 size-full"
        />
        <motion.img
          src="/figma/arrow-down-sm.svg"
          alt=""
          animate={{ y: [0, 2.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute left-1/2 top-1/2 w-[7.8px] -translate-x-1/2 -translate-y-1/2 rotate-90 ${
            cream ? "[filter:invert(13%)_sepia(72%)_saturate(3200%)_hue-rotate(350deg)]" : ""
          }`}
        />
      </motion.div>
    </section>
  );
}

/** Full-width rule with the 4-point star ornament (cream or maroon variant). */
export function Rule({
  starLeft = "50%",
  tone = "maroon",
  className = "",
}: {
  starLeft?: string;
  tone?: "maroon" | "cream";
  className?: string;
}) {
  return (
    <div className={`relative mx-auto w-[86%] ${className}`}>
      <div className={`h-px w-full ${tone === "cream" ? "bg-[#fff3d3]/60" : "bg-[#741a14]/60"}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tone === "cream" ? "/figma/contact/star-divider-cream.svg" : "/figma/about/star-maroon.svg"}
        alt=""
        className="absolute top-1/2 w-[21px] -translate-x-1/2 -translate-y-1/2"
        style={{ left: starLeft }}
      />
    </div>
  );
}

/** Underlined CTA link with arrow (Figma link pattern used across the site). */
export function UnderlineLink({
  label,
  href = "/contact",
  color = "#741a14",
  arrow = "/figma/arrow-maroon.svg",
  width = "191px",
  className = "",
}: {
  label: string;
  href?: string;
  color?: string;
  arrow?: string;
  width?: string;
  className?: string;
}) {
  return (
    <a href={href} className={`group flex shrink-0 flex-col ${className}`} style={{ width }}>
      <span className="flex items-center justify-between">
        <span className="font-sans-luxury text-[14px] font-bold uppercase" style={{ color }}>
          {label}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={arrow}
          alt=""
          className="w-[15px] transition-transform duration-300 group-hover:translate-x-1"
        />
      </span>
      <span className="mt-[9px] h-px w-full" style={{ background: color }} />
    </a>
  );
}

/** Small bold uppercase eyebrow label. */
export function Eyebrow({
  children,
  color = "#741a14",
  className = "",
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`font-sans-luxury text-[14px] font-bold uppercase leading-[16.88px] ${className}`}
      style={{ color }}
    >
      {children}
    </span>
  );
}

/** Standard fade+rise reveal used on every inner-page block. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
