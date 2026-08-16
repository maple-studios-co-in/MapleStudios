"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { RotateCcw } from "lucide-react";
import { SERVICES_DATA, WORK_DATA } from "@/lib/constants";

/**
 * MOBILE-ONLY services block: type + stacked cards over the playing particle
 * film. On desktop the services experience lives inside the horizontal work
 * track as its final panel (see ServicesStage in WorkSection).
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

  const replay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play();
  };

  return (
    <section ref={sectionRef} id="services" className="relative bg-[#0a0202] text-white lg:hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-cover"
        src={SERVICES_DATA.video}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/35" />
      <div className="relative flex flex-col gap-8 px-5 py-16">
        <div className="text-center">
          <span className="font-sans-luxury text-[13px] font-bold uppercase tracking-[0.2em] text-[#fff3d3]/90">
            {WORK_DATA.servicesLabel}
          </span>
          <div className="mt-4">
            {WORK_DATA.servicesLines.map((line) => (
              <p key={line} className="font-serif-luxury text-[13vw] leading-[0.9] text-[#fff3d3]">
                {line}
              </p>
            ))}
          </div>
        </div>
        {SERVICES_DATA.cards.map((card) => (
          <article
            key={card.id}
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
          </article>
        ))}
        <button
          type="button"
          onClick={replay}
          aria-label="Replay background video"
          className="mx-auto mt-2 flex size-[52px] items-center justify-center rounded-full border border-white/15 bg-black/60 backdrop-blur-md"
        >
          <RotateCcw className="size-[42%] text-white" strokeWidth={1.6} />
        </button>
      </div>
    </section>
  );
}
