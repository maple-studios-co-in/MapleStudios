"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import Image from "next/image";
import { WORK_DATA } from "@/lib/constants";

/** Thin divider line with the black 4-point star ornament (Figma 11:7831/11:7832). */
export function StarDivider({ starLeft = "50%" }: { starLeft?: string }) {
  return (
    <div className="relative mx-auto w-[86%]">
      <div className="h-px w-full bg-black/60" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/figma/star-divider.svg"
        alt=""
        className="absolute top-1/2 w-[21px] -translate-x-1/2 -translate-y-1/2"
        style={{ left: starLeft }}
      />
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
  return (
    <div className={className}>
      <a
        href="#work"
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
      </a>
      <div className="pt-[18px]">
        <h3 className="font-sans-luxury text-[clamp(19px,1.65vw,25px)] font-bold leading-[1.08] text-black">
          {project.title}
        </h3>
        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <p className="whitespace-pre-line font-sans-luxury text-[14px] leading-snug text-black">
            {project.description}
          </p>
          <UnderlineLink label={project.cta} width="148px" small />
        </div>
      </div>
    </div>
  );
}

/**
 * "Selected work & explorations" — pinned horizontal scroll track (Studio2.mp4):
 * vertical scroll translates the track left through heading+card 1, cards 2–3,
 * the "Discover…" slide, and finally the giant OUR SERVICES typography.
 * Below lg it falls back to a normal vertical layout.
 */
export default function WorkSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      const lg = window.matchMedia("(min-width: 1024px)").matches;
      if (!lg || !track) {
        setShift(0);
        return;
      }
      setShift(Math.max(0, track.scrollWidth - window.innerWidth));
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

  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start start", "end end"],
  });
  const x = useTransform(scrollYProgress, [0, 1], [0, -shift]);

  return (
    <section id="work" className="relative bg-[#fff3d3] text-black">
      <StarDivider />

      {/* ——— Desktop: pinned horizontal track ——— */}
      <div
        ref={wrapRef}
        className="hidden lg:block"
        style={{ height: shift ? `calc(100vh + ${shift}px)` : "auto" }}
      >
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <motion.div ref={trackRef} style={{ x }} className="flex items-center gap-[7vw]">
            {/* Slide 1: heading | first project (the Figma two-column layout) */}
            <div className="grid w-screen shrink-0 grid-cols-[50.86%_1fr]">
              <div className="flex flex-col justify-center pl-[8%] pr-[6%]">
                <h2 className="font-serif-luxury text-[clamp(44px,5.29vw,80px)] leading-[1.11] text-black">
                  {WORK_DATA.headingLines[0]}
                  <br />
                  {WORK_DATA.headingLines[1]}
                </h2>
                <div className="mt-[38px]">
                  <UnderlineLink label={WORK_DATA.viewAll} width="clamp(150px,12.63vw,191px)" />
                </div>
              </div>
              <div className="border-l border-black/60 py-[64px] pl-[3.75%] pr-[2.56%]">
                <motion.div
                  initial={{ y: 150, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: false, amount: 0.3 }}
                  transition={{ type: "spring", stiffness: 90, damping: 15, mass: 0.9 }}
                >
                  <ProjectCard project={WORK_DATA.projects[0]} />
                </motion.div>
              </div>
            </div>

            {/* Slides 2..n: cards JUMP up from below as the track carries them
                into view (trionn behaviour), replaying in both directions */}
            {WORK_DATA.projects.slice(1).map((p) => (
              <motion.div
                key={p.id}
                initial={{ y: 170, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ type: "spring", stiffness: 90, damping: 15, mass: 0.9 }}
                className="w-[43vw] shrink-0"
              >
                <ProjectCard project={p} />
              </motion.div>
            ))}

            {/* Discover slide */}
            <motion.div
              initial={{ y: 130, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ type: "spring", stiffness: 90, damping: 16, mass: 0.9 }}
              className="flex w-[36vw] shrink-0 flex-col gap-8 pl-[2vw]"
            >
              <p className="font-sans-luxury text-[clamp(16px,1.32vw,20px)] leading-[1.35] text-black">
                {WORK_DATA.discover.text}
              </p>
              <UnderlineLink label={WORK_DATA.discover.cta} width="191px" />
            </motion.div>

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
              <UnderlineLink label={WORK_DATA.viewAll} width="191px" />
            </div>
          </div>
          <ProjectCard project={WORK_DATA.projects[0]} />
        </div>
      </div>
    </section>
  );
}
