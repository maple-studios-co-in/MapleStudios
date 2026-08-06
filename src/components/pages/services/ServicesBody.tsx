"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { SERVICES_PAGE } from "@/lib/constants";
import { Eyebrow, Reveal, Rule, UnderlineLink } from "../PageKit";

/** Marquee word row: BRANDING ✦ DESIGN ✦ AI ✦ (Catilde 141.6px). */
export function WordMarquee({
  words,
  caption,
  color = "#741a14",
}: {
  words: string[];
  caption: string;
  color?: string;
}) {
  const row = [...words, ...words, ...words];
  return (
    <div className="overflow-hidden py-[clamp(24px,3vw,48px)]">
      <div className="animate-marquee flex w-max items-center gap-[3vw] whitespace-nowrap">
        {row.map((w, i) => (
          <span key={`${w}-${i}`} className="flex items-center gap-[3vw]">
            <span
              className="font-serif-luxury text-[clamp(56px,9.37vw,141.6px)] uppercase leading-normal tracking-[0.05em]"
              style={{ color }}
            >
              {w}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/figma/about/star-maroon-sm.svg" alt="" className="w-[21px] shrink-0" />
          </span>
        ))}
      </div>
      <p className="mt-6 text-center">
        <Eyebrow>✦ {caption}</Eyebrow>
      </p>
    </div>
  );
}

export default function ServicesBody() {
  const [open, setOpen] = useState(0);

  return (
    <div className="bg-[#fff3d3] text-black">
      {/* Intro statement */}
      <section className="px-[8%] pb-[clamp(40px,5vw,72px)] pt-[clamp(64px,8vw,120px)]">
        <Reveal>
          <h2 className="mx-auto max-w-[1150px] text-center font-serif-luxury text-[clamp(34px,4.1vw,62px)] font-normal leading-[1.15] text-[#741a14]">
            {SERVICES_PAGE.intro}
          </h2>
        </Reveal>
      </section>

      <WordMarquee words={SERVICES_PAGE.words} caption={SERVICES_PAGE.wordsCaption} />

      <Rule className="my-[clamp(40px,5vw,80px)]" />

      {/* Three service blocks */}
      <section className="flex flex-col gap-[clamp(56px,6vw,90px)] px-[8%]">
        {SERVICES_PAGE.blocks.map((b, i) => (
          <Reveal key={b.id} delay={i * 0.06}>
            <article className="grid grid-cols-1 gap-6 border-t border-[#741a14]/25 pt-8 lg:grid-cols-[120px_1fr_1fr] lg:gap-10">
              <span className="font-serif-luxury text-[clamp(28px,2.6vw,40px)] text-[#741a14]">
                {b.n}
              </span>
              <h3 className="font-sans-luxury text-[clamp(22px,1.98vw,30px)] font-bold leading-[1.13] text-black">
                {b.title}
              </h3>
              <p className="font-sans-luxury text-[clamp(13px,1.19vw,18px)] leading-normal text-black">
                <span className="font-bold">{b.lead}</span>
                <br />
                {b.body}
              </p>
            </article>
          </Reveal>
        ))}
      </section>

      {/* TECHNOLOGY STACK */}
      <section className="px-[8%] pb-[clamp(40px,5vw,72px)] pt-[clamp(80px,10vw,150px)] text-center">
        <Reveal>
          <p className="font-serif-luxury text-[clamp(48px,6.55vw,99px)] leading-[0.95] text-[#741a14]">
            {SERVICES_PAGE.stackHeading[0]}
          </p>
          <p className="font-serif-luxury text-[clamp(48px,6.55vw,99px)] leading-[0.95] text-[#741a14]">
            {SERVICES_PAGE.stackHeading[1]}
          </p>
          <p className="mx-auto mt-6 max-w-[320px] font-sans-luxury text-[16px] font-bold uppercase leading-[1.5] text-black">
            {SERVICES_PAGE.stackNote}
          </p>
        </Reveal>
      </section>

      {/* Numbered capability accordion */}
      <section className="px-[2%] pb-[clamp(64px,8vw,120px)]">
        {SERVICES_PAGE.capabilities.map((c, i) => {
          const isOpen = open === i;
          return (
            <div key={c.n} className="border-t border-black/30 last:border-b">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="grid w-full cursor-pointer grid-cols-[48px_1fr_48px] items-center gap-4 px-[2%] py-7 text-left"
              >
                <span className="font-sans-luxury text-[clamp(15px,1.32vw,20px)] text-black">{c.n}</span>
                <span className="font-sans-luxury text-[clamp(17px,1.65vw,25px)] font-bold text-black">
                  {c.title}
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="justify-self-end font-sans-luxury text-[18px] text-[#741a14]"
                  aria-hidden="true"
                >
                  ↓
                </motion.span>
              </button>

              <motion.div
                initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-8 px-[2%] pb-10 pl-[calc(2%+48px)] md:grid-cols-2">
                  <div>
                    <Eyebrow color="#000">{c.platformsLabel}</Eyebrow>
                    <ul className="mt-3 flex flex-col gap-1">
                      {c.platforms.map((p) => (
                        <li key={p} className="font-sans-luxury text-[14px] text-black">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <Eyebrow color="#000">{c.coreLabel}</Eyebrow>
                    <ul className="mt-3 flex flex-col gap-1">
                      {c.core.map((p) => (
                        <li key={p} className="font-sans-luxury text-[14px] text-black">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </section>

      {/* OUR PROCESS */}
      <section className="px-[8%] pb-[clamp(80px,10vw,150px)]">
        <Reveal>
          <Eyebrow>{SERVICES_PAGE.processLabel}</Eyebrow>
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_330px] lg:items-end">
            <h2 className="font-serif-luxury text-[clamp(40px,4.76vw,72px)] leading-[1.05] text-[#741a14]">
              {SERVICES_PAGE.processHeading}
            </h2>
            <p className="font-sans-luxury text-[clamp(14px,1.19vw,18px)] leading-normal text-black">
              {SERVICES_PAGE.processIntro}
            </p>
          </div>
        </Reveal>

        <div className="mt-[clamp(48px,6vw,90px)] grid grid-cols-1 gap-10 md:grid-cols-3">
          {SERVICES_PAGE.steps.map((s, i) => (
            <Reveal key={s.step} delay={i * 0.08}>
              <Eyebrow color="#000">{s.step}</Eyebrow>
              <h3 className="mt-3 font-sans-luxury text-[clamp(20px,1.98vw,30px)] font-bold text-black">
                {s.title}
              </h3>
              <p className="mt-3 font-sans-luxury text-[14px] leading-normal text-black">{s.body}</p>
            </Reveal>
          ))}
        </div>

        <Rule className="mt-[clamp(56px,7vw,100px)]" starLeft="42%" />

        <Reveal className="mt-[clamp(40px,5vw,72px)] flex justify-center">
          <UnderlineLink label="START A COLLABORATION" href="/contact" width="241px" />
        </Reveal>
      </section>
    </div>
  );
}
