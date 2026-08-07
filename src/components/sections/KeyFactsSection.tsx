"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { KEY_FACTS_DATA } from "@/lib/constants";

export default function KeyFactsSection() {
  return (
    <section
      id="key-facts"
      // -mt-[60vh]: rides up OVER the strip exit WHILE the strips are still
      // completing (~2/3 through their run), so the heading is already
      // entering from the bottom as the cream takes over — no dead cream
      // screen between the transition and Key facts (its predecessor is the
      // compact marquee band, short-mode pin with a 120vh runway). z-20
      // keeps it above the strip overlay.
      className="relative z-20 -mt-[60vh] bg-[#fff3d3] text-[#5d1411] pt-4 pb-24 px-6 sm:px-12"
    >
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-16">
        {/* Section Header */}
        <motion.div
          // Fast, early reveal: during the strip hand-off the heading must be
          // readable the moment it clears the viewport bottom, not 0.8s later.
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.45 }}
          className="text-center flex flex-col items-center gap-2"
        >
          <h2 className="font-serif-luxury text-[clamp(56px,6.61vw,100px)] font-normal leading-normal text-[#741a14]">
            {KEY_FACTS_DATA.heading}
          </h2>
          <p className="font-sans-luxury text-[clamp(15px,1.32vw,20px)] text-black max-w-md font-medium">
            {KEY_FACTS_DATA.subtitle}
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
            transition={{ duration: 0.9, delay: 0, ease: [0.22, 1, 0.36, 1] }}
            className="relative group rounded-2xl overflow-hidden shadow-xl aspect-[3/4] flex flex-col justify-between p-6 sm:p-8 text-white border border-black/10"
          >
            {/* Background Image */}
            <Image
              src={KEY_FACTS_DATA.cards[0].image || "/images/featured_chair.png"}
              alt="Featured & Awards"
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-700 brightness-[0.88]"
            />
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

          {/* Card 2: Projects Completed (Solid Maroon Card) */}
          <motion.div
            initial={{ opacity: 0, y: 120, rotate: 6, rotateX: 52, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0, rotateX: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative group rounded-2xl overflow-hidden shadow-xl aspect-[3/4] flex flex-col justify-between p-6 sm:p-8 bg-[#761c17] text-[#fff3d3] border border-black/10"
          >
            {/* Top Label */}
            <div className="text-center">
              <span className="text-[11px] font-sans-luxury font-bold tracking-widest uppercase text-[#fff3d3]/80">
                {KEY_FACTS_DATA.cards[1].tag}
              </span>
            </div>

            {/* Center Circle Container with Huge Stat */}
            <div className="my-auto flex justify-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="w-44 h-44 sm:w-48 sm:h-48 rounded-full bg-[#fff3d3] text-[#5d1411] flex items-center justify-center shadow-2xl"
              >
                <span className="font-serif-luxury text-5xl sm:text-6xl font-bold tracking-tight">
                  {KEY_FACTS_DATA.cards[1].stat}
                </span>
              </motion.div>
            </div>

            {/* Bottom Subtext */}
            <div className="text-center px-2">
              <p className="text-xs sm:text-sm font-sans-luxury text-[#fff3d3]/90 leading-snug font-medium">
                {KEY_FACTS_DATA.cards[1].title}
              </p>
            </div>
          </motion.div>

          {/* Card 3: Our Team Members */}
          <motion.div
            initial={{ opacity: 0, y: 120, rotate: -6, rotateX: 52, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0, rotateX: 0, scale: 1 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
          transition={{ duration: 0.8 }}
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
