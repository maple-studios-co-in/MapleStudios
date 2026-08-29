"use client";

import { motion } from "motion/react";
import { FOOTER_DATA } from "@/lib/constants";
import GradientCycler from "@/components/common/GradientCycler";

/**
 * Final CTA / footer — Figma Home 13:8015 region (maroon #741A14, 1513x841).
 * "Ready to build something bold?" + collaboration CTA, contact columns,
 * and the giant clipped "Maple Studios" wordmark at the bottom.
 *
 * `seamless` drops the solid fill / top radius / local cycler so a parent
 * page's fixed gradient (e.g. /work) reads as one continuous background.
 */
export default function Footer({ seamless = false }: { seamless?: boolean }) {
  return (
    <footer
      id="contact"
      // min-h-[100svh] + flex: at full scroll the footer top aligns with the
      // viewport top, so the kicker always rests at its own pt (≥120px) —
      // clear of the fixed navbar on EVERY viewport height (a fixed-height
      // footer parks the kicker in the navbar band on tall screens).
      // pt raised from max(120px,12.9vw): the kicker was clearing the fixed
      // navbar band by only a few px, so "LET'S BUILD WORK THAT INSPIRES." read
      // as if it were glued to the Maple Studios lockup above it.
      className={`relative isolate flex min-h-[100svh] flex-col overflow-hidden px-[max(20px,2.12%)] pb-[max(140px,15.5vw)] pt-[max(168px,17vw)] text-[#fff3d3] ${
        seamless ? "bg-transparent" : "rounded-t-[8px] bg-[#741a14]"
      }`}
    >
      {/* Own cycler only when the footer paints its own maroon ground */}
      {!seamless ? <GradientCycler /> : null}
      {/* Kicker */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1.7 }}
        className="font-sans-luxury text-[16px] font-bold uppercase leading-[1.06]"
      >
        {FOOTER_DATA.kicker}
      </motion.p>

      {/* Heading + CTA */}
      <div className="mt-[max(36px,4.2vw)] flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 2.2 }}
          className="font-serif-luxury text-[max(44px,5.29vw)] leading-[1.11] text-[#fff3d3]"
        >
          {FOOTER_DATA.headingLines[0]}
          <br />
          {FOOTER_DATA.headingLines[1]}
        </motion.h2>

        <motion.a
          href="mailto:contact@maplestudios.co.in"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 2, delay: 0.42 }}
          className="group flex w-[241px] shrink-0 flex-col"
        >
          <span className="flex items-center justify-between">
            <span className="font-sans-luxury text-[max(14px,0.926vw)] font-bold uppercase text-[#fff3d3]">
              {FOOTER_DATA.cta}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figma/arrow-cream-footer.svg"
              alt=""
              className="w-[max(15px,0.992vw)] transition-transform duration-300 group-hover:translate-x-1"
            />
          </span>
          <span className="mt-[10px] h-px w-full bg-[#fff3d3]" />
        </motion.a>
      </div>

      {/* Contact columns — mt-auto pins them to the footer's bottom band so
          extra viewport height opens up between heading and columns */}
      <div className="mt-auto grid grid-cols-1 gap-10 pt-[max(40px,3.8vw)] sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto] lg:gap-x-[max(48px,8vw)]">
        <p className="font-sans-luxury text-[max(14px,0.926vw)] font-bold uppercase text-[#fff3d3]">
          {FOOTER_DATA.copyright}
        </p>

        <div>
          <p className="font-sans-luxury text-[max(14px,0.926vw)] font-bold uppercase text-[#fff3d3]">
            {FOOTER_DATA.enquiryLabel}
          </p>
          <div className="mt-[26px] grid grid-cols-[auto_1fr] gap-x-[8px] gap-y-[10px]">
            <span className="font-sans-luxury text-[16px] text-white">E.</span>
            <a
              href={`mailto:${FOOTER_DATA.email}`}
              className="font-sans-luxury text-[max(14px,0.926vw)] leading-[21px] text-white transition-colors hover:text-[#fff3d3]"
            >
              {FOOTER_DATA.email}
            </a>
            <span className="font-sans-luxury text-[16px] text-white">P.</span>
            <a
              href={`tel:${FOOTER_DATA.phone.replace(/\s/g, "")}`}
              className="font-sans-luxury text-[max(14px,0.926vw)] leading-[21px] text-white transition-colors hover:text-[#fff3d3]"
            >
              {FOOTER_DATA.phone}
            </a>
          </div>
        </div>

        <div>
          <p className="font-sans-luxury text-[max(14px,0.926vw)] font-bold uppercase text-[#fff3d3]">
            {FOOTER_DATA.socialLabel}
          </p>
          <div className="mt-[26px] grid grid-cols-2 gap-x-[56px] gap-y-[10px]">
            {FOOTER_DATA.socials.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="font-sans-luxury text-[16px] text-white transition-colors hover:text-[#fff3d3]"
              >
                {s.name}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Giant clipped wordmark */}
      <motion.p
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 2.8, ease: "easeOut" }}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[26%] select-none whitespace-nowrap font-serif-luxury text-[max(76px,15.54vw)] font-semibold leading-[0.95] text-[#93352f]/50"
      >
        {FOOTER_DATA.giant}
      </motion.p>
    </footer>
  );
}
