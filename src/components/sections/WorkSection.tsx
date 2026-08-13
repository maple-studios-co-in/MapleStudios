"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { WORK_DATA } from "@/lib/constants";
import ServicesStage from "./ServicesStage";

/** Thin divider line with the exact Figma star ornament (20.722 x 20.955,
    fill #000, stroke #741A14 @ 0.289) centred on the line. */
export function StarDivider({ starLeft = "50%" }: { starLeft?: string }) {
  return (
    // 21px-tall box: the WHOLE star lives inside this section, so the
    // -mt-overlapping neighbours (z-20) can never cover its top half
    <div className="relative z-30 mx-auto flex h-[21px] w-[86%] items-center">
      <div className="h-px w-full bg-black/60" />
      <svg
        viewBox="0 0 21 21"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="star-twinkle absolute top-1/2 h-[20.955px] w-[20.722px] -translate-x-1/2 -translate-y-1/2"
        style={{ left: starLeft }}
        aria-hidden="true"
      >
        <path
          d="M10.3457 0.874023C10.8317 3.55134 11.8549 5.72759 13.4385 7.36523C15.0131 8.99364 17.1309 10.0776 19.7949 10.5996C17.1326 11.0508 15.0365 12.0846 13.4678 13.6758C11.8848 15.2815 10.8502 17.4424 10.3037 20.1113C9.82354 17.4417 8.85203 15.2669 7.29883 13.6621C5.7483 12.0602 3.63244 11.0397 0.888672 10.6494C3.60793 10.024 5.70873 8.9604 7.2627 7.35645C8.81935 5.74955 9.81465 3.6141 10.3457 0.874023Z"
          fill="black"
          stroke="#741A14"
          strokeWidth="0.288524"
        />
      </svg>
    </div>
  );
}

function UnderlineLink({
  label,
  color = "#741a14",
  arrow = "/figma/arrow-maroon.svg",
  width = "191px",
  href = "#contact",
  small = false,
}: {
  label: string;
  color?: string;
  arrow?: string;
  width?: string;
  href?: string;
  small?: boolean;
}) {
  return (
    <a href={href} className="group flex shrink-0 flex-col" style={{ width }}>
      <span className="flex items-center justify-between">
        <span
          className={`font-sans-luxury font-bold uppercase ${small ? "text-[12px]" : "text-[14px]"}`}
          style={{ color }}
        >
          {label}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={arrow}
          alt=""
          className="w-[15px] transition-transform duration-300 group-hover:translate-x-1"
        />
      </span>
      <span className="mt-[9px] h-px w-full" style={{ background: color }} />
    </a>
  );
}

function ProjectCard({
  project,
  className = "",
}: {
  project: (typeof WORK_DATA.projects)[number];
  className?: string;
}) {
  const href = project.href ?? "/work";
  return (
    <div className={className}>
      <Link
        href={href}
        className="group block overflow-hidden rounded-[6px]"
        aria-label={project.title}
      >
        <div className="relative aspect-[810/556] w-full overflow-hidden rounded-[6px]">
          <Image
            src={project.image}
            alt={project.title}
            fill
            sizes="(min-width: 1024px) 45vw, 92vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        </div>
      </Link>
      <div className="pt-[18px]">
        <h3 className="font-sans-luxury text-[clamp(19px,1.65vw,25px)] font-bold leading-[1.08] text-black">
          {project.title}
        </h3>
        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <p className="max-w-[340px] whitespace-pre-line font-sans-luxury text-[14px] leading-snug text-black">
            {project.description}
          </p>
          <Link href={href} className="group flex w-[148px] shrink-0 flex-col">
            <span className="flex items-center justify-between">
              <span className="font-sans-luxury text-[12px] font-bold uppercase text-[#741a14]">
                {project.cta}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figma/arrow-maroon.svg"
                alt=""
                className="w-[14px] transition-transform duration-300 group-hover:translate-x-1"
              />
            </span>
            <span className="mt-[9px] h-px w-full bg-[#741a14]" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * "Selected work & explorations" — one continuous pinned timeline:
 * the horizontal track slides through heading+card 1 → cards 2-3 → discover,
 * then the SERVICES STAGE (video + type burst + DNA-spawned cards) arrives as
 * the FINAL PANEL of the same track — no vertical hop between them. The
 * track's x finishes, and the remaining scroll drives the stage's progress.
 */
export default function WorkSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ shift: 0, seq: 0, vw: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      const lg = window.matchMedia("(min-width: 1024px)").matches;
      // clientWidth (not innerWidth/100vw): excludes the scrollbar, so the
      // full-width panels — and the 50% column rule — match the star's centre
      const vw = document.documentElement.clientWidth;
      if (!lg || !track) {
        setDims({ shift: 0, seq: 0, vw });
        return;
      }
      setDims({
        shift: Math.max(0, track.scrollWidth - vw),
        // scroll budget for the stage phases (type hold → burst → emission)
        seq: Math.round(window.innerHeight * 5.2),
        vw,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, []);

  const total = dims.shift + dims.seq;
  const shiftFrac = total > 0 ? dims.shift / total : 1;

  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });
  const x = useTransform(scrollYProgress, [0, shiftFrac], [0, -dims.shift]);
  // Before measurement (SSR / first client render) dims are 0 and shiftFrac
  // is 1 — a degenerate [1,1] range that resolved to progress 1 and rendered
  // the stage at its END state on the server (hydration mismatch). Map from
  // an unreachable range instead so seq stays 0 until real dims exist.
  const seqRaw = useTransform(scrollYProgress, total > 0 ? [shiftFrac, 1] : [2, 3], [0, 1]);
  const seq = useSpring(seqRaw, { stiffness: 30, damping: 14, restDelta: 0.0005 });

  return (
    <section id="work" className="relative bg-[#fff3d3] text-black">
      {/* star sits exactly at the intersection with the vertical column rule (50%) */}
      <StarDivider />

      {/* ——— Desktop: pinned horizontal track ending in the services stage ——— */}
      <div
        ref={wrapRef}
        className="hidden lg:block"
        style={{ height: total ? `calc(100vh + ${total}px)` : "auto" }}
      >
        <div className="sticky top-0 flex h-screen transform-gpu items-center overflow-hidden">
          <motion.div ref={trackRef} style={{ x }} className="flex h-full items-center gap-[7vw]">
            {/* Slide 1: heading | first project (the Figma two-column layout) */}
            <div
              className="grid w-screen shrink-0 grid-cols-[50%_1fr] self-center"
              style={dims.vw ? { width: dims.vw } : undefined}
            >
              <div className="flex flex-col justify-center pl-[8%] pr-[6%]">
                <h2 className="font-serif-luxury text-[clamp(44px,5.29vw,80px)] leading-[1.11] text-black">
                  {WORK_DATA.headingLines[0]}
                  <br />
                  {WORK_DATA.headingLines[1]}
                </h2>
                <div className="mt-[38px]">
                  <UnderlineLink label={WORK_DATA.viewAll} href="/work" width="clamp(150px,12.63vw,191px)" />
                </div>
              </div>
              <div className="border-l border-black/60 py-[64px] pl-[3.75%] pr-[2.56%]">
                <motion.div
                  initial={{ y: 150, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: false, amount: 0.3 }}
                  transition={{ type: "spring", stiffness: 20, damping: 7, mass: 0.9 }}
                >
                  <ProjectCard project={WORK_DATA.projects[0]} />
                </motion.div>
              </div>
            </div>

            {/* Slides 2..n: cards JUMP up from below as the track carries them in */}
            {WORK_DATA.projects.slice(1).map((p) => (
              <motion.div
                key={p.id}
                initial={{ y: 170, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ type: "spring", stiffness: 20, damping: 7, mass: 0.9 }}
                className="w-[43vw] shrink-0 self-center"
              >
                <ProjectCard project={p} />
              </motion.div>
            ))}

            {/* Discover slide */}
            <motion.div
              initial={{ y: 130, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ type: "spring", stiffness: 20, damping: 8, mass: 0.9 }}
              className="flex w-[36vw] shrink-0 flex-col gap-8 self-center pl-[2vw]"
            >
              <p className="font-sans-luxury text-[clamp(16px,1.32vw,20px)] leading-[1.35] text-black">
                {WORK_DATA.discover.text}
              </p>
              <UnderlineLink label={WORK_DATA.discover.cta} href="/work" width="191px" />
            </motion.div>

            {/* Final panel: the services stage slides in horizontally, then the
                remaining scroll (seq) plays type-burst + DNA card emission */}
            <div
              className="relative h-screen w-screen shrink-0"
              style={dims.vw ? { width: dims.vw } : undefined}
            >
              <ServicesStage progress={seq} />
            </div>
          </motion.div>
        </div>
      </div>

      {/* ——— Mobile / tablet: vertical fallback ——— */}
      <div className="lg:hidden">
        <div className="flex flex-col gap-10 px-[8%] py-16">
          <div>
            <h2 className="font-serif-luxury text-[clamp(44px,5.29vw,80px)] leading-[1.11] text-black">
              {WORK_DATA.headingLines[0]}
              <br />
              {WORK_DATA.headingLines[1]}
            </h2>
            <div className="mt-[28px]">
              <UnderlineLink label={WORK_DATA.viewAll} href="/work" width="191px" />
            </div>
          </div>
          {WORK_DATA.projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
