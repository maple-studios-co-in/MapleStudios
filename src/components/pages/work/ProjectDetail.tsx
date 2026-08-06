"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { WORK_DETAIL, WORK_PAGE } from "@/lib/constants";
import GradientCycler from "@/components/common/GradientCycler";

type Project = (typeof WORK_PAGE.projects)[number];

/**
 * Project detail — Figma frame 14:8429.
 * The left column (title, description, services, tabbed copy) is STICKY and
 * stays put; the right column of project imagery scrolls past it.
 */
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

  // The right rail repeats the project imagery — swap per-project when real
  // shots exist (WORK_PAGE.projects[].image drives it today).
  const shots = [project.image, project.image, project.image, project.image];

  return (
    <div
      className="relative isolate"
      style={{
        background:
          "radial-gradient(53% 240% at 50% 68%, #741A14 18.5%, #520F0A 59%, #2F0500 100%)",
      }}
    >
      <GradientCycler />
      <div className="grid grid-cols-1 gap-10 px-[4%] pb-[clamp(64px,8vw,120px)] pt-[clamp(120px,13vw,190px)] lg:grid-cols-[34%_1fr] lg:gap-[4%]">
        {/* ——— Sticky left column ——— */}
        <div className="lg:sticky lg:top-[110px] lg:h-fit lg:self-start">
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
                onClick={() => setTab(i)}
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
        <div className="flex flex-col gap-[clamp(20px,2.6vw,40px)]">
          {shots.map((src, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
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
