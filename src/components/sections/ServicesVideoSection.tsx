"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { SERVICES_DATA, SERVICES_PAGE, WORK_DATA } from "@/lib/constants";
import { UnderlineLink } from "@/components/pages/PageKit";

/**
 * MOBILE-ONLY services block. Two screens handed off with the SAME
 * transition the desktop /services page uses between its panels:
 *
 *   • Screen 1 — a cream type screen (OUR SERVICES + the stacked
 *     A.I. / DESIGN / DEVELOPMENT / BRANDING lockup, caption, VIEW
 *     SERVICES) — is `sticky top-0`, so it HOLDS while
 *   • Screen 2 — the opaque dark film block — slides straight up OVER it.
 *
 * That is exactly ServicePanels' mechanic (sticky panel + the next opaque
 * panel riding over it), so the home page and the services page share one
 * transition vocabulary. No clip-path growth, no chip: the film simply
 * arrives as the incoming screen, then stays pinned behind the service
 * cards as they scroll up over it.
 *
 * On desktop the services experience lives inside the horizontal work
 * track as its final panel (ServicesStage in WorkSection).
 */
export default function ServicesVideoSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Decode frames only while the section is near the viewport.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const v = videoRef.current;
        if (!v) return;
        if (entry.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { rootMargin: "25% 0px" }
    );
    io.observe(section);
    return () => io.disconnect();
  }, []);

  return (
    // NO overflow-hidden on the section: it would break the sticky screens
    // inside it (repo rule — nothing between body and a sticky element may
    // set overflow).
    <section ref={sectionRef} id="services" className="relative bg-[#0a0202] text-white lg:hidden">
      {/* ——— Screen 1: cream type screen, pinned while screen 2 rides over ——— */}
      <div className="sticky top-0 z-0 flex h-svh flex-col items-center justify-center overflow-hidden bg-[#fff3d3] px-5 pt-[max(48px,6svh)] text-center">
        <span className="font-sans-luxury text-[13px] font-bold uppercase tracking-[0.2em] text-[#741a14]">
          {WORK_DATA.servicesLabel}
        </span>
        <div className="mt-5">
          {WORK_DATA.servicesLines.map((line) => (
            <p
              key={line}
              // 13.8vw: DEVELOPMENT (the longest line) sets the cap
              className="font-serif-luxury text-[13.8vw] uppercase leading-[0.92] text-[#741a14]"
            >
              {line}
            </p>
          ))}
        </div>
        <p className="mx-auto mt-7 max-w-[280px] font-sans-luxury text-[12px] font-bold uppercase leading-[1.5] tracking-[-0.02em] text-black/80">
          ✦ {SERVICES_PAGE.wordsCaption}
        </p>
        <div className="mt-8 flex justify-center">
          <UnderlineLink
            label="VIEW SERVICES"
            href="/services"
            width="185px"
            color="#741a14"
            arrow="/figma/arrow-maroon.svg"
          />
        </div>
      </div>

      {/* Dwell: the type screen holds alone for a beat before the film
          starts climbing over it */}
      <div aria-hidden="true" className="h-[26vh]" />

      {/* ——— Screen 2: the film block slides up over the pinned type screen.
          Opaque ground is load-bearing — it is what covers screen 1. ——— */}
      <div className="relative z-10 bg-[#0a0202]">
        {/* film layer: fills the block, its inner screen pinned so the video
            stays put behind the cards while they scroll past */}
        <div aria-hidden="true" className="absolute inset-0">
          <div className="sticky top-0 h-svh overflow-hidden">
            <video
              ref={videoRef}
              className="absolute inset-0 size-full object-cover"
              src={SERVICES_DATA.video}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
            {/* scrim so the cards stay readable over the film */}
            <div className="absolute inset-0 bg-black/40" />
          </div>
        </div>

        {/* the film gets one clear screen of its own before the cards begin */}
        <div aria-hidden="true" className="h-[62vh]" />

        {/* ——— Service cards ride up over the pinned film ——— */}
        <div className="relative z-10 flex flex-col gap-14 px-5 pb-20">
          {SERVICES_DATA.cards.map((card, i) => (
            <motion.article
              key={card.id}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.9, delay: (i % 2) * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-[12px] border border-white/20 bg-[#2a0c0a]/55 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-[14px]"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-sans-luxury text-[max(14px,0.926vw)] font-bold leading-normal text-white">
                  {card.title}
                </h3>
                <Image
                  src={card.icon}
                  alt=""
                  width={28}
                  height={28}
                  className="mt-0.5 size-7 shrink-0 object-contain"
                />
              </div>
              <p className="mt-2 font-sans-luxury text-[max(14px,0.926vw)] font-normal leading-normal text-white">
                <span className="font-bold">{card.lead}</span> {card.body}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
