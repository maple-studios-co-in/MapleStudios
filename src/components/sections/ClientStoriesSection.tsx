"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { CLIENT_STORIES_DATA } from "@/lib/constants";
import { StarDivider } from "./WorkSection";

/**
 * Client stories (Figma Home 13:7968–13:8005).
 * Cream canvas, client list on the left (active item full black, rest 54%),
 * testimonial + author on the right, round prev/next controls.
 */
export default function ClientStoriesSection() {
  const [active, setActive] = useState(1); // GET SHOKU active in the design
  const count = CLIENT_STORIES_DATA.stories.length;
  const story = CLIENT_STORIES_DATA.stories[active];

  const prev = () => setActive((i) => (i - 1 + count) % count);
  const next = () => setActive((i) => (i + 1) % count);

  // keep this section free of overflow-hidden — sticky pins live in ancestors/siblings
  return (
    // pt (not child mt): without overflow-hidden a first-child top MARGIN
    // collapses out of the section, opening a maroon page-bg gap above it
    // -mt-[90vh]: same hand-off as Key facts, measured against StripExit's
    // RUNWAY_VH (150) for a TALL predecessor (pin offset 0) — rides up while
    // the work/services strip exit is still closing. Rescale with RUNWAY_VH.
    // It must also stay well under (this section + footer) height, or the
    // container outlasts the footer and its runway shows below it.
    <section id="stories" className="relative z-20 -mt-[90vh] bg-[#fff3d3] pt-[max(16px,2vw)] text-black">
      {/* Heading row */}
      <div className="mx-auto grid w-full grid-cols-1 items-center gap-6 px-[10.4%] lg:grid-cols-2">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 2 }}
          className="font-serif-luxury text-[max(44px,5.29vw)] leading-none text-black"
        >
          {CLIENT_STORIES_DATA.heading}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 2, delay: 0.3 }}
          className="max-w-[240px] font-sans-luxury text-[max(15px,1.32vw)] leading-[1.2] text-black"
        >
          {CLIENT_STORIES_DATA.subtitle}
        </motion.p>
      </div>

      <div className="mt-[max(40px,4.5vw)]">
        <StarDivider />
      </div>

      {/* Content row */}
      <div className="mx-auto mt-[max(40px,5.5vw)] grid w-full grid-cols-1 gap-12 px-[10.4%] lg:grid-cols-[41%_1fr]">
        {/* Left: client list + carousel arrows */}
        <div className="flex flex-col">
          <ul className="flex flex-col gap-[14px]">
            {CLIENT_STORIES_DATA.stories.map((s, i) => (
              <li key={s.client}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={`cursor-pointer font-sans-luxury text-[16px] font-bold uppercase leading-[1.06] transition-opacity duration-300 hover:opacity-100 ${
                    i === active ? "opacity-100" : "opacity-[0.54]"
                  }`}
                >
                  {s.client}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-[max(48px,6.5vw)] flex items-center gap-8">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous story"
              className="size-[40px] cursor-pointer transition-transform duration-300 hover:-translate-x-0.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/carousel-prev.svg" alt="" className="size-full" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next story"
              className="size-[40px] rotate-180 cursor-pointer transition-transform duration-300 hover:translate-x-0.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/carousel-next.svg" alt="" className="size-full" />
            </button>
          </div>
        </div>

        {/* Right: testimonial + author */}
        <div className="flex max-w-[573px] flex-col">
          <div className="min-h-[max(120px,10vw)]">
            <AnimatePresence mode="wait">
              <motion.blockquote
                key={active}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
                className="font-sans-luxury text-[max(20px,1.98vw)] font-medium leading-[1.2] text-black"
              >
                {story.quote}
              </motion.blockquote>
            </AnimatePresence>
          </div>

          <div className="mt-[max(32px,3.5vw)] flex items-center">
            <div className="relative h-[75px] w-[76px] overflow-hidden rounded-[6px]">
              <Image
                src={story.avatar}
                alt={story.name}
                fill
                sizes="76px"
                className="object-cover"
              />
            </div>
            <div className="ml-[25px] flex flex-col">
              <span className="font-sans-luxury text-[16px] font-bold text-black">{story.name}</span>
              <span className="mt-1 font-sans-luxury text-[max(14px,0.926vw)] text-black">{story.role}</span>
            </div>
          </div>

          <a
            href="#contact"
            className="group mt-[max(28px,3vw)] flex w-[191px] flex-col"
          >
            <span className="flex items-center justify-between">
              <span className="font-sans-luxury text-[max(14px,0.926vw)] font-bold uppercase text-[#741a14]">
                {CLIENT_STORIES_DATA.cta}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figma/arrow-maroon.svg"
                alt=""
                className="w-[max(15px,0.992vw)] transition-transform duration-300 group-hover:translate-x-1"
              />
            </span>
            <span className="mt-[9px] h-px w-full bg-[#741a14]" />
          </a>
        </div>
      </div>

      {/* Bottom divider — star ornament sits left of center in the design (42.9%) */}
      <div className="mt-[max(64px,8vw)] pb-[64px]">
        <StarDivider starLeft="42.92%" />
      </div>
    </section>
  );
}
