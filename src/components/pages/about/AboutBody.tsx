"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { ABOUT_PAGE } from "@/lib/constants";
import { Eyebrow, Reveal, Rule, UnderlineLink } from "../PageKit";
import { WordMarquee } from "../services/ServicesBody";
import GradientCycler from "@/components/common/GradientCycler";

/**
 * About hero — Figma 22:625: big maroon Catilde statement over a cut-out eagle,
 * with the BRANDING ✦ DESIGN ✦ AI word row crossing the image.
 */
export function AboutHero() {
  return (
    <section
      className="relative isolate overflow-hidden px-[8%] pb-[clamp(40px,5vw,72px)] pt-[clamp(140px,15vw,220px)] text-center"
      style={{
        background:
          "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)",
      }}
    >
      <GradientCycler />
      <motion.h1
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.7 }}
        className="relative z-10 mx-auto max-w-[1150px] font-serif-luxury text-[clamp(30px,3.7vw,56px)] font-normal leading-[1.18] text-[#fff3d3]"
      >
        {ABOUT_PAGE.hero.title}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, delay: 0.3 }}
        className="relative z-10 mx-auto mt-5 max-w-[430px] font-sans-luxury text-[clamp(13px,1.19vw,18px)] leading-normal text-white"
      >
        {ABOUT_PAGE.hero.subtitle}
      </motion.p>

      {/* Eagle + overlapping word marquee */}
      <div className="relative mt-[-2%]">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2.2, delay: 0.4, ease: "easeOut" }}
          className="relative mx-auto aspect-[4096/2341] w-[clamp(320px,58vw,880px)]"
        >
          <Image
            src="/figma/about/eagle.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 58vw, 90vw"
            className="object-contain"
          />
        </motion.div>

        <div className="pointer-events-none absolute inset-x-0 bottom-[18%]">
          <WordMarquee words={ABOUT_PAGE.words} caption={ABOUT_PAGE.wordsCaption} color="#fff3d3" />
        </div>
      </div>
    </section>
  );
}

export default function AboutBody() {
  return (
    <div className="bg-[#fff3d3] text-black">
      {/* AT MAPLE, + statement */}
      <section className="px-[8%] pb-[clamp(56px,7vw,100px)] pt-[clamp(56px,7vw,100px)]">
        <Reveal>
          <Eyebrow>{ABOUT_PAGE.atMaple}</Eyebrow>
          <p className="mt-4 max-w-[643px] font-sans-luxury text-[clamp(18px,1.85vw,28px)] font-medium leading-[1.35] text-black">
            {ABOUT_PAGE.atMapleBody}
          </p>
        </Reveal>
      </section>

      <Rule />

      {/* Badge + mission */}
      <section className="grid grid-cols-1 gap-12 px-[8%] py-[clamp(56px,7vw,100px)] lg:grid-cols-2">
        <Reveal>
          <div className="flex h-[79px] w-[clamp(240px,18vw,272px)] overflow-hidden rounded-[4px] border border-[#741a14]">
            <div className="flex w-[37.5%] items-center justify-center bg-[#741a14]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/logo-mark.svg" alt="Maple Studios" className="h-[27px] w-auto" />
            </div>
            <div className="flex flex-1 items-center px-3">
              <span className="font-sans-luxury text-[9px] font-bold uppercase leading-[1.4] text-[#741a14]">
                {ABOUT_PAGE.badge}
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="flex flex-col gap-5 lg:pl-[10%]">
          {ABOUT_PAGE.mission.map((m, i) => (
            <p key={i} className="max-w-[330px] font-sans-luxury text-[14px] leading-normal text-black">
              {m}
            </p>
          ))}
          <UnderlineLink label={ABOUT_PAGE.missionCta} href="/contact" width="191px" className="mt-2" />
        </Reveal>
      </section>

      <Rule starLeft="10%" />

      {/* Our values */}
      <section className="px-[8%] pb-[clamp(72px,9vw,140px)] pt-[clamp(56px,7vw,100px)]">
        <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <h2 className="font-serif-luxury text-[clamp(40px,4.76vw,72px)] font-normal leading-normal text-[#741a14]">
            {ABOUT_PAGE.valuesHeading}
          </h2>
          <p className="max-w-[373px] font-sans-luxury text-[14px] leading-normal text-black">
            {ABOUT_PAGE.valuesIntro}
          </p>
        </Reveal>

        <div className="mt-[clamp(40px,5vw,72px)] lg:pl-[32%]">
          {ABOUT_PAGE.values.map((v, i) => (
            <Reveal key={v} delay={i * 0.05}>
              <article className="grid grid-cols-1 items-center gap-4 border-b border-[#741a14]/15 bg-white/70 px-[5%] py-7 transition-colors duration-300 hover:bg-white sm:grid-cols-[1fr_1.1fr]">
                <h3 className="font-sans-luxury text-[clamp(18px,1.65vw,25px)] font-medium text-black">
                  {v}
                </h3>
                <p className="font-sans-luxury text-[13px] leading-normal text-black">
                  {ABOUT_PAGE.valueBody}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 lg:pl-[32%]">
          <Eyebrow>✦ {ABOUT_PAGE.valuesCaption}</Eyebrow>
        </Reveal>
      </section>
    </div>
  );
}
