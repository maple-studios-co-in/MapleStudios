"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { ABOUT_DATA } from "@/lib/constants";
import ScrollFadeText from "@/components/common/ScrollFadeText";

export default function AboutSection() {
  return (
    <section
      id="about"
      className="relative min-h-screen bg-[#5d1411] text-white flex flex-col justify-between py-24 px-6 sm:px-12 overflow-hidden border-b border-white/10"
    >
      {/* Container */}
      <div className="max-w-7xl mx-auto w-full flex flex-col justify-between flex-grow gap-16">
        {/* Top Header Tag */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3"
        >
          <span className="w-2 h-2 rounded-full bg-amber-200" />
          <span className="text-xs font-sans-luxury tracking-widest uppercase font-semibold text-white/70">
            {ABOUT_DATA.tag}
          </span>
        </motion.div>

        {/* Main Serif Statement Headline — fades in word-by-word while scrolling */}
        <div className="max-w-6xl">
          <ScrollFadeText
            text={ABOUT_DATA.headline}
            className="font-serif-luxury text-[clamp(40px,5.29vw,80px)] font-light leading-none text-[#fff3d3]"
          />
        </div>

        {/* Horizontal Divider Line with Center Diamond/Star Icon */}
        <div className="relative w-full my-4">
          <div className="w-full h-px bg-white/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#5d1411] px-4 text-amber-200 text-sm">
            ✦
          </div>
        </div>

        {/* Dual Text Columns Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start"
        >
          {/* Left Column (Cols 1 to 5) */}
          <div className="md:col-span-5 flex flex-col gap-1 text-xs font-sans-luxury tracking-widest text-white/70 uppercase leading-relaxed font-medium">
            {ABOUT_DATA.leftColumn.map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>

          {/* Right Column (Cols 6 to 12) */}
          <div className="md:col-span-7 flex flex-col items-start gap-6">
            <p className="text-base sm:text-xl font-sans-luxury text-white/90 leading-relaxed font-light">
              {ABOUT_DATA.rightText}
            </p>

            <a
              href="#contact"
              className="inline-flex items-center gap-3 text-xs tracking-widest uppercase font-sans-luxury font-semibold text-white hover:text-amber-200 transition-colors group mt-2"
            >
              <span>{ABOUT_DATA.cta}</span>
              <div className="w-7 h-7 rounded-full border border-white/30 flex items-center justify-center group-hover:border-amber-200 group-hover:translate-x-1 transition-all">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </a>
          </div>
        </motion.div>

        {/* Focused Vision Tag */}
        <div className="pt-8">
          <p className="text-[11px] font-sans-luxury tracking-widest uppercase text-white/60 font-medium">
            {ABOUT_DATA.focusedVision}
            <br />
            {ABOUT_DATA.measuredExecution}
          </p>
        </div>
      </div>

      {/* Infinite Marquee Banner at bottom of section — words separated by the
          Figma 24px star (exact svg); hover pauses, no color change */}
      <div className="w-full mt-16 pt-8 border-t border-white/10 overflow-hidden select-none">
        <div className="animate-marquee whitespace-nowrap flex items-center gap-[3vw]">
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              className="flex items-center gap-[3vw] font-serif-luxury text-[clamp(64px,9.37vw,141.6px)] tracking-[0.05em] text-[#fff3d3] font-normal uppercase"
            >
              {ABOUT_DATA.marqueeText
                .split("✦")
                .map((w) => w.trim())
                .filter(Boolean)
                .map((word) => (
                  <span key={word} className="flex items-center gap-[3vw]">
                    {word}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="aspect-square w-[clamp(14px,1.59vw,24px)] shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        d="M11.9824 0.876953C12.5356 3.9958 13.7265 6.52544 15.5811 8.42188C17.424 10.3064 19.9115 11.5525 23.0479 12.1406C19.9126 12.646 17.4512 13.8353 15.6152 15.6768C13.763 17.5346 12.5587 20.0435 11.9326 23.1494C11.3843 20.0429 10.2538 17.5178 8.43652 15.6611C6.62345 13.8088 4.14106 12.6354 0.912109 12.2012C4.11282 11.4892 6.57827 10.2661 8.39551 8.41113C10.2177 6.55112 11.3739 4.07043 11.9824 0.876953Z"
                        fill="#FFF3D3"
                        stroke="white"
                        strokeWidth="0.288524"
                      />
                    </svg>
                  </span>
                ))}
            </span>
          ))}
        </div>
        <div className="text-center mt-6">
          <span className="text-[11px] font-sans-luxury tracking-widest text-amber-200/80 uppercase font-semibold">
            {ABOUT_DATA.bottomSub}
          </span>
        </div>
      </div>
    </section>
  );
}
