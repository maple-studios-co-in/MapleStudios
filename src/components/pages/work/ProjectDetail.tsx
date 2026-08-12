"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { deckFor, WORK_DETAIL, WORK_PAGE } from "@/lib/constants";
import GradientCycler from "@/components/common/GradientCycler";

type Project = (typeof WORK_PAGE.projects)[number];

/**
 * Project detail — Figma frame 14:8429.
 * The left column (title, description, services, tabbed copy) is STICKY and
 * stays put; the right column of project imagery scrolls past it.
 *
 * Deck mode (WORK_DETAIL.decks, keyed by project id): the rail shows that
 * project's case-study PDF as ONE continuous strip (tiled from seamless
 * WebPs purely for progressive lazy-loading — visually the uncut canvas),
 * and the tabs stay in sync with it BOTH ways:
 *   tab click -> the page scrolls that section's spot on the canvas to just
 *     under the navbar;
 *   rail scroll -> the tab of the last section scrolled past lights up.
 * Both directions read the same anchor line, so a click leaves the tab it
 * selected active. Projects with no deck keep the repeated hero shot and
 * plain (non-scrolling) tabs.
 */
const NAV_CLEARANCE = 110; // fixed navbar + breathing room above a jump target
const SETTLE_SLACK = 2; // px; a smooth scroll lands a hair off its target
const JUMP_TIMEOUT = 1600; // ms a tab jump may mute the scroll-spy for

const wantsReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function ProjectDetail({
  project,
  prev,
  next,
}: {
  project: Project;
  prev: Project;
  next: Project;
}) {
  const [tab, setTab] = useState(0);
  const deckWrapRef = useRef<HTMLDivElement>(null);
  // A tab jump animates across whole sections. Left alone, the scroll-spy
  // would light up each one it flies past and restart the copy animation, so
  // the jump mutes the spy until the scroll settles on its target.
  const jumpRef = useRef<{ top: number; until: number } | null>(null);

  // decks are static objects, so this reference is stable across renders
  const deck = deckFor(project.id);
  const deckTiles = deck
    ? Array.from({ length: deck.count }, (_, i) => `${deck.dir}/slice-${String(i + 1).padStart(2, "0")}.webp`)
    : [];
  // Plain rail: the repeated project imagery — swap per-project when real
  // shots exist.
  const shots = [project.image, project.image, project.image, project.image];

  /**
   * Where each tab's section sits in the document, in px — its anchor's PDF-y
   * mapped onto the RENDERED strip (which scales with the column, so it has
   * to be measured, not assumed). Null until there is a strip to measure.
   */
  const sectionTops = useCallback(() => {
    const el = deckWrapRef.current;
    if (!deck || !el) return null;
    const r = el.getBoundingClientRect();
    if (!r.height) return null;
    const stripTop = window.scrollY + r.top;
    return WORK_DETAIL.tabs.map(
      (t) => stripTop + (deck.anchors[t.id] / deck.canvasH) * r.height,
    );
  }, [deck]);

  const openTab = (i: number) => {
    setTab(i);
    const tops = sectionTops();
    if (!tops) return;
    const top = Math.max(tops[i] - NAV_CLEARANCE, 0);
    if (Math.abs(window.scrollY - top) <= SETTLE_SLACK) return; // already there
    jumpRef.current = { top, until: performance.now() + JUMP_TIMEOUT };
    // "instant", not "auto" — globals.css sets html { scroll-behavior: smooth },
    // which "auto" would inherit
    window.scrollTo({ top, behavior: wantsReducedMotion() ? "instant" : "smooth" });
  };

  // Rail -> tabs: the active tab is the last section whose anchor has passed
  // the line a click scrolls to, which is what keeps the two in agreement.
  useEffect(() => {
    if (!deck) return;
    let raf = 0;
    const sync = () => {
      const jump = jumpRef.current;
      if (jump) {
        const landed = Math.abs(window.scrollY - jump.top) <= SETTLE_SLACK;
        if (!landed && performance.now() < jump.until) return;
        jumpRef.current = null;
      }
      const tops = sectionTops();
      if (!tops) return;
      const line = window.scrollY + NAV_CLEARANCE + SETTLE_SLACK;
      let active = 0;
      tops.forEach((top, i) => {
        if (top <= line) active = i;
      });
      setTab(active);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    // a real scroll gesture cancels the browser's smooth scroll, so it has to
    // release the spy too — otherwise the tabs freeze until the timeout
    const onGesture = () => {
      jumpRef.current = null;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("wheel", onGesture, { passive: true });
    window.addEventListener("touchmove", onGesture, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", onGesture);
      window.removeEventListener("touchmove", onGesture);
      cancelAnimationFrame(raf);
    };
  }, [deck, sectionTops]);

  return (
    <div
      className="relative isolate"
      style={{
        background:
          "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)",
      }}
    >
      <GradientCycler />
      <div
        className={`grid grid-cols-1 gap-10 pb-[clamp(64px,8vw,120px)] pt-[clamp(120px,13vw,190px)] lg:grid-cols-[34%_1fr] lg:gap-[4%] ${
          deck ? "pl-[4%] pr-0" : "px-[4%]"
        }`}
      >
        {/* ——— Sticky left column ——— */}
        <div className="transform-gpu lg:sticky lg:top-[110px] lg:h-fit lg:self-start">
          <Link href="/work" className="group flex w-[191px] flex-col">
            <span className="flex items-center justify-between">
              <span className="font-sans-luxury text-[14px] font-bold uppercase text-[#fff3d3]">
                {WORK_DETAIL.back}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figma/arrow-cream.svg"
                alt=""
                className="w-[15px] rotate-180 transition-transform duration-300 group-hover:-translate-x-1"
              />
            </span>
            <span className="mt-[9px] h-px w-full bg-[#fff3d3]" />
          </Link>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mt-[clamp(28px,3.4vw,52px)] font-sans-luxury text-[clamp(28px,2.65vw,40px)] font-bold leading-[1.06] text-[#fff3d3]"
          >
            {project.title}
          </motion.h1>

          <p className="mt-4 max-w-[345px] font-sans-luxury text-[clamp(13px,1.06vw,16px)] leading-normal text-white">
            {project.description}
          </p>

          <ul className="mt-[clamp(24px,3vw,44px)] flex flex-col gap-2">
            {WORK_DETAIL.services.map((s) => (
              <li
                key={s}
                className="flex items-center gap-3 font-sans-luxury text-[14px] text-white"
              >
                <span className="size-[3px] rounded-full bg-[#fff3d3]" />
                {s}
              </li>
            ))}
          </ul>

          {/* Tabs */}
          <div className="mt-[clamp(28px,3.4vw,52px)] flex flex-wrap gap-x-5 gap-y-2">
            {WORK_DETAIL.tabs.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openTab(i)}
                aria-pressed={i === tab}
                className={`cursor-pointer pb-1 font-sans-luxury text-[13px] font-bold uppercase transition-colors ${
                  i === tab
                    ? "border-b border-[#fff3d3] text-[#fff3d3]"
                    : "border-b border-transparent text-white/55 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <motion.p
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-5 max-w-[430px] font-sans-luxury text-[14px] leading-relaxed text-white"
          >
            {WORK_DETAIL.tabs[tab].body}
          </motion.p>
        </div>

        {/* ——— Scrolling right rail ——— */}
        {deck ? (
          // the ENTIRE case-study canvas as one continuous strip: tiles
          // butt flush inside a single rounded wrapper (no gaps, no
          // per-tile corners), so nothing reads as "cut". One entrance
          // fade for the whole strip; tiles below the fold lazy-load as
          // the visitor scrolls.
          <motion.div
            ref={deckWrapRef}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full self-start overflow-hidden rounded-l-[8px]"
          >
            {deckTiles.map((src, i) => (
              <Image
                key={i}
                src={src}
                alt={`${project.title} — case study part ${i + 1}`}
                width={deck.tileW}
                height={deck.tileH}
                sizes="(min-width: 1024px) 60vw, 92vw"
                className="block h-auto w-full"
                priority={i === 0}
              />
            ))}
          </motion.div>
        ) : (
          <div className="flex flex-col gap-[clamp(20px,2.6vw,40px)]">
            {shots.map((src, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
                // aspect matches the artwork (1480/1016) so the full frame —
                // including the "Hi, I'm Alex." baseline — is never cropped
                className="relative aspect-[810/556] w-full overflow-hidden rounded-[8px]"
              >
                <Image
                  src={src}
                  alt={`${project.title} — view ${i + 1}`}
                  fill
                  sizes="(min-width: 1024px) 60vw, 92vw"
                  className="object-cover"
                  priority={i === 0}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Prev / next */}
      <div className="flex items-center justify-between px-[4%] pb-[clamp(64px,8vw,110px)]">
        <Link href={`/work/${prev.id}`} className="group flex flex-col">
          <span className="font-sans-luxury text-[clamp(13px,1.06vw,16px)] font-bold uppercase text-[#fff3d3]">
            {WORK_DETAIL.prev}
          </span>
          <span className="mt-1 font-sans-luxury text-[13px] text-white/60 transition-colors group-hover:text-white">
            {prev.title}
          </span>
        </Link>
        <Link href={`/work/${next.id}`} className="group flex flex-col text-right">
          <span className="font-sans-luxury text-[clamp(13px,1.06vw,16px)] font-bold uppercase text-[#fff3d3]">
            {WORK_DETAIL.next}
          </span>
          <span className="mt-1 font-sans-luxury text-[13px] text-white/60 transition-colors group-hover:text-white">
            {next.title}
          </span>
        </Link>
      </div>
    </div>
  );
}
