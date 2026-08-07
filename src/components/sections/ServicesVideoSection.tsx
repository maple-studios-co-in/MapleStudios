"use client";

import { useEffect, useRef } from "react";
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
            className="flex flex-col gap-4 rounded-[8px] border border-white/10 bg-black/35 p-6 backdrop-blur-[4px]"
          >
            <h3 className="font-sans-luxury text-[22px] font-bold leading-[1.13] text-[#fff3d3]">
              {card.titleLines.join(" ")}
            </h3>
            <p className="font-sans-luxury text-[13px] leading-normal text-white/90">
              <span className="font-bold text-white">{card.lead}</span>
              <br />
              {card.body}
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
