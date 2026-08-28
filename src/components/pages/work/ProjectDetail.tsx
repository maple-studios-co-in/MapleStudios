"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { deckFor, isLightProject, tabsFor, WORK_DETAIL, WORK_PAGE } from "@/lib/constants";
import GradientCycler from "@/components/common/GradientCycler";

type Project = (typeof WORK_PAGE.projects)[number];

/**
 * The page runs in one of two schemes (WORK_DETAIL.lightProjects picks which).
 * `light` is the maroon scheme turned inside out: cream (#FFF3D3) becomes the
 * ground and brand maroon (#741A14) carries ALL the ink — headings and body
 * alike. Class names are spelled out in full because Tailwind only compiles
 * literals it can see.
 *
 * `base` is a real background-color under the gradient, not decoration: the
 * navbar recolors itself by sampling the computed background-color of what
 * sits beneath it, and a gradient alone reads as transparent to that probe.
 */
const PALETTES = {
  dark: {
    base: "#741a14",
    gradient:
      "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)",
    cycler: true,
    ink: "text-[#fff3d3]",
    body: "text-white",
    muted: "text-white/55",
    mutedHover: "hover:text-white",
    subtle: "text-white/60",
    subtleHover: "group-hover:text-white",
    rule: "bg-[#fff3d3]",
    activeTab: "border-b border-[#fff3d3] text-[#fff3d3]",
    arrow: "/figma/arrow-cream.svg",
  },
  light: {
    // Solid brand cream — no lightening gradient (that washed to #FFFBEE)
    base: "#FFF3D3",
    gradient: null,
    cycler: false,
    ink: "text-[#741a14]",
    body: "text-[#741a14]",
    muted: "text-[#741a14]/55",
    mutedHover: "hover:text-[#741a14]",
    subtle: "text-[#741a14]/60",
    subtleHover: "group-hover:text-[#741a14]",
    rule: "bg-[#741a14]",
    activeTab: "border-b border-[#741a14] text-[#741a14]",
    arrow: "/figma/arrow-maroon.svg",
  },
} as const;

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

  const palette = PALETTES[isLightProject(project.id) ? "light" : "dark"];
  // decks are static objects, so this reference is stable across renders
  const deck = deckFor(project.id);
  const tabs = tabsFor(project.id);
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
    return tabs.map(
      (t) => stripTop + (deck.anchors[t.id] / deck.canvasH) * r.height,
    );
  }, [deck, tabs]);

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
        backgroundColor: palette.base,
        ...(palette.gradient ? { backgroundImage: palette.gradient } : {}),
      }}
    >
      {palette.cycler ? <GradientCycler /> : null}
      <div
        className={`grid grid-cols-1 gap-10 pb-[max(64px,8vw)] pt-[max(120px,13vw)] lg:grid-cols-[34%_1fr] lg:gap-[4%] ${
          deck ? "pl-[4%] pr-0" : "px-[4%]"
        }`}
      >
        {/* ——— Sticky left column ——— */}
        <div className="lg:sticky lg:top-[110px] lg:h-fit lg:self-start">
          <Link href="/work" className="group flex w-[191px] flex-col">
            <span className="flex items-center justify-between">
              <span className={`font-sans-luxury text-[max(14px,0.926vw)] font-bold uppercase ${palette.ink}`}>
                {WORK_DETAIL.back}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={palette.arrow}
                alt=""
                className="w-[max(15px,0.992vw)] rotate-180 transition-transform duration-300 group-hover:-translate-x-1"
              />
            </span>
            <span className={`mt-[9px] h-px w-full ${palette.rule}`} />
          </Link>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`mt-[max(28px,3.4vw)] font-sans-luxury text-[max(28px,2.65vw)] font-bold leading-[1.06] ${palette.ink}`}
          >
            {project.title}
          </motion.h1>

          <p
            className={`mt-4 max-w-[345px] whitespace-pre-line font-sans-luxury text-[max(13px,1.06vw)] leading-normal ${palette.body}`}
          >
            {project.description}
          </p>

          <ul className="mt-[max(24px,3vw)] flex flex-col gap-2">
            {WORK_DETAIL.services.map((s) => (
              <li
                key={s}
                className={`flex items-center gap-3 font-sans-luxury text-[max(14px,0.926vw)] ${palette.body}`}
              >
                <span className={`size-[3px] rounded-full ${palette.rule}`} />
                {s}
              </li>
            ))}
          </ul>

          {/* Tabs */}
          <div className="mt-[max(28px,3.4vw)] flex flex-wrap gap-x-5 gap-y-2">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openTab(i)}
                aria-pressed={i === tab}
                className={`cursor-pointer pb-1 font-sans-luxury text-[13px] font-bold uppercase transition-colors ${
                  i === tab
                    ? palette.activeTab
                    : `border-b border-transparent ${palette.muted} ${palette.mutedHover}`
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
            className={`mt-5 max-w-[430px] font-sans-luxury text-[max(14px,0.926vw)] leading-relaxed ${palette.body}`}
          >
            {tabs[tab].body}
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
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
            // Pull the strip up so its top lands with the left title band
            // instead of sitting a step below BACK TO WORK
            className="relative w-full self-start overflow-hidden rounded-l-[8px] lg:-mt-[max(48px,5.5vw)]"
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
          <div className="flex flex-col gap-[max(20px,2.6vw)]">
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
      <div className="flex items-center justify-between px-[4%] pb-[max(64px,8vw)]">
        <Link href={`/work/${prev.id}`} className="group flex flex-col">
          <span
            className={`font-sans-luxury text-[max(13px,1.06vw)] font-bold uppercase ${palette.ink}`}
          >
            {WORK_DETAIL.prev}
          </span>
          <span
            className={`mt-1 font-sans-luxury text-[13px] transition-colors ${palette.subtle} ${palette.subtleHover}`}
          >
            {prev.title}
          </span>
        </Link>
        <Link href={`/work/${next.id}`} className="group flex flex-col text-right">
          <span
            className={`font-sans-luxury text-[max(13px,1.06vw)] font-bold uppercase ${palette.ink}`}
          >
            {WORK_DETAIL.next}
          </span>
          <span
            className={`mt-1 font-sans-luxury text-[13px] transition-colors ${palette.subtle} ${palette.subtleHover}`}
          >
            {next.title}
          </span>
        </Link>
      </div>
    </div>
  );
}
