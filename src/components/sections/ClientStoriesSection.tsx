"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { CLIENT_STORIES_DATA } from "@/lib/constants";
import { StarDivider } from "./WorkSection";

/** Round prev/next controls. Rendered twice — desktop closes the left
    column with them, phones carry them under the story — so the pair is
    defined once here. 44px on phones meets the touch-target minimum (the
    40px design size is a pointer-only comfort). */
function CarouselArrows({ prev, next }: { prev: () => void; next: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={prev}
        aria-label="Previous story"
        className="size-[44px] cursor-pointer transition-transform duration-300 hover:-translate-x-0.5 lg:size-[40px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/carousel-prev.svg" alt="" className="size-full" />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next story"
        className="size-[44px] rotate-180 cursor-pointer transition-transform duration-300 hover:translate-x-0.5 lg:size-[40px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/carousel-next.svg" alt="" className="size-full" />
      </button>
    </>
  );
}

/**
 * Client stories (Figma Home 13:7968–13:8005).
 * Cream canvas, client list on the left (active item full black, rest 54%),
 * testimonial + author on the right, round prev/next controls.
 */
/** `stories` comes from the console via the page; the shipped constant is the
    fallback so the carousel is never empty. */
export default function ClientStoriesSection({
  stories = CLIENT_STORIES_DATA.stories,
  copy = CLIENT_STORIES_DATA,
}: {
  stories?: (typeof CLIENT_STORIES_DATA.stories)[number][];
  /** heading / subtitle / cta from Site Copy */
  copy?: { heading: string; subtitle: string; cta: string };
}) {
  const [active, setActive] = useState(0);
  const count = stories.length;
  // The list, the arrows and the quote all index `stories` — the console's
  // list — and the index is clamped, because the console can shrink it (even
  // to nothing) under a visitor who has a story open.
  const current = count ? Math.min(active, count - 1) : 0;
  const story = count ? stories[current] : null;

  const prev = () => {
    if (count) setActive((current - 1 + count) % count);
  };
  const next = () => {
    if (count) setActive((current + 1) % count);
  };

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
          {copy.heading}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 2, delay: 0.3 }}
          className="max-w-[240px] font-sans-luxury text-[max(15px,1.32vw)] leading-[1.2] text-black"
        >
          {copy.subtitle}
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
            {stories.map((s, i) => (
              <li key={`${s.client}-${i}`}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={`cursor-pointer font-sans-luxury text-[16px] font-bold uppercase leading-[1.06] transition-opacity duration-300 hover:opacity-100 ${
                    i === current ? "opacity-100" : "opacity-[0.54]"
                  }`}
                >
                  {s.client}
                </button>
              </li>
            ))}
          </ul>

          {/* Desktop: the controls close the left column, beside the quote.
              On phones the stack put them BETWEEN the client list and the
              testimonial, where they read as two stranded arrows pointing at
              nothing — there they move below the story instead (see the
              phone copy after the right column). */}
          <div className="mt-[max(48px,6.5vw)] hidden items-center gap-8 lg:flex">
            <CarouselArrows prev={prev} next={next} />
          </div>
        </div>

        {/* Right: testimonial + author */}
        <div className="flex max-w-[573px] flex-col">
          <div className="min-h-[max(120px,10vw)]">
            <AnimatePresence mode="wait">
              {story ? (
                <motion.blockquote
                  key={current}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.35 }}
                  className="font-sans-luxury text-[max(20px,1.98vw)] font-medium leading-[1.2] text-black"
                >
                  {story.quote}
                </motion.blockquote>
              ) : null}
            </AnimatePresence>
          </div>

          {story ? (
            <div className="mt-[max(32px,3.5vw)] flex items-center">
              {/* a testimonial added in the console has no art-directed portrait */}
              {story.avatar ? (
                <div className="relative mr-[25px] h-[75px] w-[76px] overflow-hidden rounded-[6px]">
                  <Image
                    src={story.avatar}
                    alt={story.name}
                    fill
                    sizes="76px"
                    className="object-cover"
                    style={{ objectPosition: story.focal ?? "50% 15%" }}
                  />
                </div>
              ) : null}
              <div className="flex flex-col">
                <span className="font-sans-luxury text-[16px] font-bold text-black">{story.name}</span>
                <span className="mt-1 font-sans-luxury text-[max(14px,0.926vw)] text-black">{story.role}</span>
              </div>
            </div>
          ) : null}

          <a
            href="#contact"
            className="group mt-[max(28px,3vw)] flex w-[191px] flex-col"
          >
            <span className="flex items-center justify-between">
              <span className="font-sans-luxury text-[max(14px,0.926vw)] font-bold uppercase text-[#741a14]">
                {copy.cta}
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

          {/* Phone copy of the controls: carousel arrows belong UNDER the
              story they page through, on its own rule-separated row */}
          <div className="mt-8 flex items-center gap-6 border-t border-black/15 pt-7 lg:hidden">
            <CarouselArrows prev={prev} next={next} />
            <span className="ml-auto font-sans-luxury text-[12px] font-bold uppercase tracking-[0.14em] text-black/45">
              {String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom divider — star ornament sits left of center in the design (42.9%) */}
      <div className="mt-[max(64px,8vw)] pb-[64px]">
        <StarDivider starLeft="42.92%" />
      </div>
    </section>
  );
}
