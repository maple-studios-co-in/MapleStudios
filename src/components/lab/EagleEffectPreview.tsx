"use client";

import { useRef } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { ABOUT_PAGE } from "@/lib/constants";
import BlurTextReveal from "@/components/common/BlurTextReveal";
import { WordMarquee } from "@/components/pages/services/ServicesBody";

const CLIP = "/video/eagle-white-portion-h264.mp4";
const CLIP_END = 7.95;

/**
 * Designer preview — /about is not imported and not modified.
 * The attached white-head clip (H.264) is scrubbed 1:1 with scroll.
 */
export default function EagleEffectPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });

  const vidTime = useTransform(scrollYProgress, [0, 1], [0.02, CLIP_END]);
  useMotionValueEvent(vidTime, "change", (t) => {
    const v = videoRef.current;
    if (v && v.readyState >= 1 && Math.abs(v.currentTime - t) > 0.04) v.currentTime = t;
  });

  return (
    <div ref={wrapRef} className="relative h-[420vh] bg-[#fff3d3]">
      <section className="sticky top-0 isolate flex h-svh flex-col overflow-hidden bg-[#fff3d3] text-center text-black">
        <p className="pointer-events-none absolute left-4 top-[max(72px,9svh)] z-20 rounded-full border border-[#741a14]/25 bg-[#fff3d3]/80 px-3 py-1 font-sans-luxury text-[11px] font-bold uppercase tracking-[0.14em] text-[#741a14] backdrop-blur-sm">
          Test only · /about unchanged
        </p>
        <p className="pointer-events-none absolute right-4 top-[max(72px,9svh)] z-20 font-sans-luxury text-[11px] uppercase tracking-[0.14em] text-[#741a14]">
          Scroll to play the clip
        </p>

        <BlurTextReveal
          as="h1"
          text={ABOUT_PAGE.hero.title}
          className="relative z-20 mx-auto max-w-[79.2%] shrink-0 pt-[clamp(88px,14svh,142px)] font-serif-luxury text-[clamp(19px,min(3.4vw,6.4svh),52px)] font-normal leading-[1.12] tracking-[0.05em] text-[#741a14]"
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 mt-[0.5svh] flex min-h-0 w-full flex-1 items-center justify-center px-4"
        >
          <video
            ref={videoRef}
            src={CLIP}
            poster="/figma/about/eagle-live.webp"
            muted
            playsInline
            preload="auto"
            aria-label="Eagle white-head look-around"
            className="h-auto max-h-full w-[min(96vw,1100px)] bg-[#fff3d3] object-contain"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.pause();
              v.currentTime = 0.02;
            }}
          />
        </motion.div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-[0.5svh]">
          <WordMarquee words={ABOUT_PAGE.words} caption={ABOUT_PAGE.wordsCaption} tight />
        </div>
      </section>
    </div>
  );
}
