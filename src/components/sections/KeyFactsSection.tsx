"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { KEY_FACTS_DATA } from "@/lib/constants";
import BuildTimer from "@/components/common/BuildTimer";

export default function KeyFactsSection() {
  return (
    <section
      id="key-facts"
      // -mt-[92vh]: rides up OVER the strip exit WHILE the strips are still
      // closing, so the heading is already entering from the bottom as the
      // cream takes over — no dead cream screen between the transition and
      // Key facts. Measured at rest against StripExit's RUNWAY_VH (150) and
      // the short-mode pin offset of the compact marquee band: puts the
      // heading on screen about a quarter into the strip run. Rescale if
      // RUNWAY_VH changes. z-20 keeps it above the strip overlay.
      className="relative z-20 -mt-[92vh] bg-[#fff3d3] text-[#5d1411] pt-4 pb-24 px-6 sm:px-12"
    >
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-16">
        {/* Section Header */}
        <motion.div
          // Fast, early reveal: during the strip hand-off the heading must be
          // readable the moment it clears the viewport bottom, not 0.8s later.
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 1.3 }}
          className="text-center flex flex-col items-center gap-2"
        >
          <h2 className="font-serif-luxury text-[max(56px,6.61vw)] font-normal leading-normal text-[#741a14]">
            {KEY_FACTS_DATA.heading}
          </h2>
          <p className="font-sans-luxury text-[max(15px,1.32vw)] text-black font-medium">
            {KEY_FACTS_DATA.subtitleLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </motion.div>

        {/* 3 Key Fact Cards Grid — cards fly in tilted, then straighten (Studio.mp4 effect) */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8"
          style={{ perspective: "1400px" }}
        >
          {/* Card 1: Featured & Awards — lies back and stands up; replays on
              every entry, scrolling down AND back up (viewport once:false) */}
          <motion.div
            initial={{ opacity: 0, y: 120, rotate: -8, rotateX: 52, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0, rotateX: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 2.6, delay: 0, ease: [0.22, 1, 0.36, 1] }}
            className="relative group rounded-2xl overflow-hidden shadow-xl aspect-[3/4] flex flex-col justify-between p-6 sm:p-8 text-white border border-black/10"
          >
            {/* Background media — video when set, otherwise the still */}
            {KEY_FACTS_DATA.cards[0].video ? (
              <video
                src={KEY_FACTS_DATA.cards[0].video}
                poster={KEY_FACTS_DATA.cards[0].image}
                autoPlay
                muted
                loop
                playsInline
                aria-hidden="true"
                className="absolute inset-0 size-full object-cover brightness-[0.88] transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <Image
                src={KEY_FACTS_DATA.cards[0].image || "/images/featured_chair.png"}
                alt="Featured & Awards"
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-700 brightness-[0.88]"
              />
            )}
            {/* Top Label */}
            <div className="relative z-10">
              <span className="text-[11px] font-sans-luxury font-bold tracking-widest uppercase text-white/90 drop-shadow-md">
                {KEY_FACTS_DATA.cards[0].tag}
              </span>
            </div>
            {/* Bottom Content */}
            <div className="relative z-10 flex items-end justify-between gap-4 mt-auto">
              <p className="text-xs sm:text-sm font-sans-luxury text-white/90 leading-snug max-w-[160px] drop-shadow-md font-medium">
                {KEY_FACTS_DATA.cards[0].title}
              </p>
              <span className="font-serif-luxury text-5xl sm:text-6xl font-medium text-white drop-shadow-lg">
                {KEY_FACTS_DATA.cards[0].stat}
              </span>
            </div>
          </motion.div>

          {/* Card 2: Avg. Time to First Live Build (Solid Maroon Card with Live BuildTimer) */}
          <motion.div
            initial={{ opacity: 0, y: 120, rotate: 6, rotateX: 52, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0, rotateX: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 2.6, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="relative group rounded-2xl overflow-hidden shadow-xl aspect-[3/4] flex flex-col justify-between p-6 sm:p-8 bg-[#761c17] text-[#fff3d3] border border-black/10"
          >
            {/* Top Label */}
            <div className="text-center">
              <span className="text-[11px] font-sans-luxury font-bold tracking-[0.18em] uppercase text-[#fff3d3]">
                {KEY_FACTS_DATA.cards[1].tag}
              </span>
            </div>

            {/* Center Circle Container with Live BuildTimer */}
            <div className="my-auto flex justify-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-[#fff3d3] text-[#741a14] flex flex-col items-center justify-center shadow-2xl p-4"
              >
                <BuildTimer
                  format="colon"
                  className="font-sans-luxury text-4xl sm:text-[42px] font-extrabold tracking-tight text-[#741a14]"
                />
                <span className="mt-1 text-[11px] font-sans-luxury font-bold tracking-[0.25em] text-[#741a14] uppercase">
                  {KEY_FACTS_DATA.cards[1].sublabel ?? "HRS : MINS"}
                </span>
              </motion.div>
            </div>

            {/* Bottom Subtext */}
            <div className="text-center px-2">
              <p className="text-sm sm:text-base font-sans-luxury text-[#fff3d3] leading-snug font-medium">
                {KEY_FACTS_DATA.cards[1].title}
              </p>
            </div>
          </motion.div>

          {/* Card 3: Our Team Members */}
          <motion.div
            initial={{ opacity: 0, y: 120, rotate: -6, rotateX: 52, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0, rotateX: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 2.6, delay: 0.85, ease: [0.22, 1, 0.36, 1] }}
            className="relative group rounded-2xl overflow-hidden shadow-xl aspect-[3/4] flex flex-col justify-between p-6 sm:p-8 text-white border border-black/10"
          >
            {/* Background Image */}
            <Image
              src={KEY_FACTS_DATA.cards[2].image || "/images/team_dining.png"}
              alt="Our Team Members"
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-700 brightness-[0.88]"
            />
            {/* Top Label */}
            <div className="relative z-10">
              <span className="text-[11px] font-sans-luxury font-bold tracking-widest uppercase text-white/90 drop-shadow-md">
                {KEY_FACTS_DATA.cards[2].tag}
              </span>
            </div>
            {/* Bottom Content */}
            <div className="relative z-10 flex items-end justify-between gap-4 mt-auto">
              <p className="text-xs sm:text-sm font-sans-luxury text-white/90 leading-snug max-w-[150px] drop-shadow-md font-medium whitespace-pre-line">
                {KEY_FACTS_DATA.cards[2].title}
              </p>
              <span className="font-serif-luxury text-5xl sm:text-6xl font-medium text-white drop-shadow-lg">
                {KEY_FACTS_DATA.cards[2].stat}
              </span>
            </div>
          </motion.div>
        </div>

        {/* Dashed Horizontal Line */}
        <div className="w-full my-4 border-b border-dashed border-[#5d1411]/30" />

        {/* Business Partners Sub-section */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2.3 }}
          className="flex flex-col items-center gap-8 pt-4"
        >
          <span className="text-xs font-sans-luxury font-bold tracking-widest uppercase text-[#5d1411]">
            {KEY_FACTS_DATA.partnersSectionTitle}
          </span>

          <div className="w-full flex flex-wrap items-center justify-center sm:justify-between gap-8 sm:gap-12 opacity-80 hover:opacity-100 transition-opacity">
            {/* Partner 1: credible */}
            <div className="text-xl sm:text-2xl font-bold tracking-tighter text-[#5d1411] font-sans">
              credible
            </div>

            <div className="hidden sm:block h-6 w-px bg-[#5d1411]/20" />

            {/* Partner 2: Yellowtail */}
            <div className="text-xl sm:text-2xl font-semibold tracking-normal text-[#5d1411] font-sans">
              Yellowtail
            </div>

            <div className="hidden sm:block h-6 w-px bg-[#5d1411]/20" />

            {/* Partner 3: LUXURY PRESENCE */}
            <div className="flex items-center gap-2 text-xs sm:text-sm font-light uppercase tracking-widest text-[#5d1411] font-sans">
              <div className="w-4 h-4 border border-[#5d1411] rotate-45 flex items-center justify-center text-[8px] font-bold">
                P
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-bold">LUXURY</span>
                <span>PRESENCE</span>
              </div>
            </div>

            <div className="hidden sm:block h-6 w-px bg-[#5d1411]/20" />

            {/* Partner 4: technis */}
            <div className="text-xl sm:text-2xl font-black italic tracking-wide text-[#5d1411] font-sans">
              technis
            </div>

            <div className="hidden sm:block h-6 w-px bg-[#5d1411]/20" />

            {/* Partner 5: OCKTO */}
            <div className="flex items-center gap-2 text-lg sm:text-xl font-bold tracking-wider text-[#5d1411] font-sans">
              <div className="w-4 h-4 rounded-full border-2 border-[#5d1411] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#5d1411]" />
              </div>
              <span>OCKTO</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
