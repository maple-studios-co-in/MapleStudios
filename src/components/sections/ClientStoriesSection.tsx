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
  const [active, setActive] = useState(1); // CREDIBLE active in the design
  const count = CLIENT_STORIES_DATA.stories.length;
  const story = CLIENT_STORIES_DATA.stories[active];

  const prev = () => setActive((i) => (i - 1 + count) % count);
  const next = () => setActive((i) => (i + 1) % count);

  // keep this section free of overflow-hidden — sticky pins live in ancestors/siblings
  return (
    // pt (not child mt): without overflow-hidden a first-child top MARGIN
    // collapses out of the section, opening a maroon page-bg gap above it
    <section id="stories" className="relative bg-[#fff3d3] pt-[clamp(36px,4vw,72px)] text-black">
      {/* Heading row */}
      <div className="mx-auto grid w-full grid-cols-1 items-center gap-6 px-[10.4%] lg:grid-cols-2">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="font-serif-luxury text-[clamp(44px,5.29vw,80px)] leading-none text-black"
        >
          {CLIENT_STORIES_DATA.heading}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="max-w-[240px] font-sans-luxury text-[clamp(15px,1.32vw,20px)] leading-[1.2] text-black"
        >
          {CLIENT_STORIES_DATA.subtitle}
        </motion.p>
      </div>

      <div className="mt-[clamp(40px,4.5vw,68px)]">
        <StarDivider />
      </div>

      {/* Content row */}
      <div className="mx-auto mt-[clamp(40px,5.5vw,84px)] grid w-full grid-cols-1 gap-12 px-[10.4%] lg:grid-cols-[41%_1fr]">
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

          <div className="mt-[clamp(48px,6.5vw,100px)] flex items-center gap-8">
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
          <div className="min-h-[clamp(120px,10vw,160px)]">
            <AnimatePresence mode="wait">
              <motion.blockquote
                key={active}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
                className="font-sans-luxury text-[clamp(20px,1.98vw,30px)] font-medium leading-[1.2] text-black"
              >
                {story.quote}
              </motion.blockquote>
            </AnimatePresence>
          </div>

          <div className="mt-[clamp(32px,3.5vw,52px)] flex items-center">
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
              <span className="mt-1 font-sans-luxury text-[14px] text-black">{story.role}</span>
            </div>
          </div>

          <a
            href="#contact"
            className="group mt-[clamp(28px,3vw,50px)] flex w-[191px] flex-col"
          >
            <span className="flex items-center justify-between">
              <span className="font-sans-luxury text-[14px] font-bold uppercase text-[#741a14]">
                {CLIENT_STORIES_DATA.cta}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figma/arrow-maroon.svg"
                alt=""
                className="w-[15px] transition-transform duration-300 group-hover:translate-x-1"
              />
            </span>
            <span className="mt-[9px] h-px w-full bg-[#741a14]" />
          </a>
        </div>
      </div>

      {/* Bottom divider — star ornament sits left of center in the design (42.9%) */}
      <div className="mt-[clamp(64px,8vw,120px)] pb-[64px]">
        <StarDivider starLeft="42.92%" />
      </div>
    </section>
  );
}
