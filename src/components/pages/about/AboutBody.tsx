"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ABOUT_PAGE } from "@/lib/constants";
import { Eyebrow, Reveal, Rule, UnderlineLink } from "../PageKit";
import { Star4, WordMarquee } from "../services/ServicesBody";
import StripParallax from "@/components/common/StripParallax";

/**
 * About hero — Figma 22:625 compressed into ONE viewport: CREAM canvas,
 * Catilde 60 maroon statement (60px exact at full size, height-capped so
 * the whole scene always fits a single screen), 18px subtitle tucked behind
 * the eagle, the strip-slice 3D parallax eagle, and the BRANDING ✦ DESIGN
 * ✦ AI row crossing its lower third with the caption at the fold.
 */
export function AboutHero() {
  return (
    <section className="relative isolate flex h-[100svh] flex-col overflow-hidden bg-[#fff3d3] text-center text-black">
      {/* Statement (22:645) — Catilde 60px / 400 / normal / 3px tracking /
          #741A14 / centred. min(vw, svh) keeps the exact 60px on full
          desktop and scales it down only when a small window would
          otherwise push the scene past one screen. */}
      {/* No z-index: the eagle (later in the DOM) rides OVER the statement's
          lower line, exactly like the reference composition */}
      <motion.h1
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.7 }}
        className="mx-auto max-w-[79.2%] shrink-0 pt-[clamp(56px,10.5svh,100px)] font-serif-luxury text-[clamp(22px,min(3.97vw,7.5svh),60px)] font-normal leading-[1.12] tracking-[0.05em] text-[#741a14]"
      >
        {ABOUT_PAGE.hero.title}
      </motion.h1>

      {/* Subtitle (22:627) — sits partly behind the eagle, per the design */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, delay: 0.3 }}
        className="mx-auto mt-[1svh] max-w-[469px] shrink-0 font-sans-luxury text-[clamp(13px,1.19vw,18px)] leading-normal text-black"
      >
        {ABOUT_PAGE.hero.subtitle}
      </motion.p>

      {/* Eagle (156:767) — sits BELOW the copy in normal flow and takes
          whatever height the screen has left, so it never covers a word of
          the statement or subtitle. z-10 keeps it above the marquee band
          that crosses its lower third. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2.2, delay: 0.4, ease: "easeOut" }}
        className="relative z-10 mt-[1.5svh] flex min-h-0 w-full flex-1 items-start justify-center"
      >
        <StripParallax
          src="/figma/about/eagle-front.webp"
          ariaLabel="Golden eagle"
          className="aspect-[906/669] h-full max-h-full w-auto max-w-[92vw]"
        />
      </motion.div>

      {/* BRANDING ✦ DESIGN ✦ AI crossing the eagle's lower third, caption
          on the fold (22:739-745). Fully pointer-transparent: its line boxes
          reach far above the glyphs and would otherwise swallow the pointer
          over the eagle's lower half, killing the strip-parallax hover. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-[1.5svh]">
        <WordMarquee words={ABOUT_PAGE.words} caption={ABOUT_PAGE.wordsCaption} />
      </div>
    </section>
  );
}

/* ————— Our values (Figma 22:775-815) with the trionn scroll-through:
   the screen pins, the six white cards scroll through a masked window on
   the right — rows light up through the middle band and dim toward the
   window's edges — then the pin releases. Scroll-scrubbed both ways. ————— */
function ValueRow({
  progress,
  index,
  title,
  body,
  geom,
}: {
  progress: MotionValue<number>;
  index: number;
  title: string;
  body: string;
  geom: React.RefObject<{ travel: number; windowH: number; rowTops: number[]; rowH: number }>;
}) {
  const opacity = useTransform(progress, (p) => {
    const g = geom.current;
    if (!g || g.travel < 10) return 1; // mobile / unmeasured: static list
    const centerY = g.rowTops[index] + g.rowH / 2 - g.travel * p;
    const d = Math.abs(centerY - g.windowH / 2) / g.windowH;
    return d < 0.26 ? 1 : Math.max(0.22, 1 - (d - 0.26) * 2.6);
  });
  // The fold (modelled on trionn.com, then opened up further on request):
  // each card is hinged on its TOP edge and lies back until it rises into
  // place, then opens flat — a page being turned toward you. Their sampled
  // angles were -58.9 -> -22.9 -> 0; taking it to -88 makes the card start
  // nearly edge-on, so it reads as unfolding from BEHIND rather than just
  // tilting. Eased so it hangs back late then snaps open at the end.
  const rotateX = useTransform(progress, (p) => {
    const g = geom.current;
    if (!g || g.travel < 10) return 0;
    const rowTop = g.rowTops[index] - g.travel * p;
    const zone = g.rowH * 1.9; // longer runway so the swing is readable
    const t = Math.max(0, Math.min(1, (rowTop - (g.windowH - zone)) / zone));
    return -88 * (t * t * (3 - 2 * t)); // smoothstep
  });
  // a folded card also sits back in depth, so it clears the one in front
  const z = useTransform(rotateX, (r) => (r / -88) * -90);
  return (
    <motion.article
      style={{
        opacity,
        rotateX,
        z,
        transformOrigin: "50% 0%",
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
      }}
      className="grid h-[clamp(88px,8.14vw,123px)] grid-cols-1 items-center gap-2 bg-white pl-[4.06%] pr-[1.27%] sm:grid-cols-[51.5%_1fr]"
    >
      <h3 className="font-sans-luxury text-[clamp(18px,1.98vw,30px)] font-medium leading-[1.5] text-black">
        {title}
      </h3>
      <p className="hidden max-w-[373px] font-sans-luxury text-[clamp(12px,1.06vw,16px)] font-medium leading-[1.5] text-black sm:block">
        {body}
      </p>
    </motion.article>
  );
}

function ValuesSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const geom = useRef<{ travel: number; windowH: number; rowTops: number[]; rowH: number }>({
    travel: 0,
    windowH: 1,
    rowTops: [],
    rowH: 1,
  });
  const [travel, setTravel] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const win = windowRef.current;
      const track = trackRef.current;
      if (!win || !track) return;
      const rows = [...track.children] as HTMLElement[];
      const lg = window.matchMedia("(min-width: 1024px)").matches;
      const rowH = rows[0]?.offsetHeight ?? 1;
      // travel past (track - window): the LAST row must reach the lit centre
      // of the window by p=1, not stall dimmed at its bottom edge
      const t = lg
        ? Math.max(0, track.scrollHeight - win.clientHeight / 2 - rowH / 2)
        : 0;
      // rect deltas, NOT offsetTop: before motion writes a transform the
      // track is no offsetParent, so offsetTop silently measures against a
      // positioned ancestor (+229px here) and skews the lit band
      const tr = track.getBoundingClientRect();
      geom.current = {
        travel: t,
        windowH: win.clientHeight,
        rowTops: rows.map((r) => r.getBoundingClientRect().top - tr.top),
        rowH,
      };
      // debug-inspectable snapshot of what the opacity math actually uses
      track.dataset.geom = JSON.stringify(geom.current);
      setTravel(t);
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
  const smooth = useSpring(scrollYProgress, { stiffness: 50, damping: 20, restDelta: 0.001 });
  const trackY = useTransform(smooth, (p) => -travel * p);

  return (
    <section className="pt-[clamp(64px,10.98vw,166px)]">
      {/* 280vh runway: the screen holds while the six cards scroll through */}
      <div ref={wrapRef} className="relative lg:h-[280vh]">
        <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-center">
          <div className="grid grid-cols-1 items-start gap-10 pl-[9.59%] pr-[10.45%] lg:grid-cols-[34.7%_1fr] lg:gap-0">
            {/* Our values — Catilde 70, tracking 3.5 (22:775) */}
            <Reveal>
              <h2 className="font-serif-luxury text-[clamp(38px,4.63vw,70px)] font-normal leading-normal tracking-[0.05em] text-[#741a14]">
                {ABOUT_PAGE.valuesHeading}
              </h2>
            </Reveal>

            <div>
              <Reveal>
                <p className="max-w-[373px] font-sans-luxury text-[clamp(12px,1.06vw,16px)] font-medium leading-[1.5] text-black">
                  {ABOUT_PAGE.valuesIntro}
                </p>
              </Reveal>

              {/* Masked window — cards drift through it on scroll (video ref) */}
              {/* Perspective: trionn use 2500px, but their cards only lie
                  back ~59deg. At 88deg a distance that flat flattens the
                  swing, so this is tightened to 1100px — the viewer sits
                  closer and the unfold reads as real depth. */}
              <div
                ref={windowRef}
                style={{ perspective: "1100px", perspectiveOrigin: "50% 45%" }}
                className="mt-[clamp(24px,4.83vw,73px)] overflow-hidden lg:h-[27.8vw] lg:max-h-[70vh]"
              >
                <motion.div
                  ref={trackRef}
                  style={{ y: trackY, transformStyle: "preserve-3d" }}
                  className="flex flex-col gap-[4px]"
                >
                  {ABOUT_PAGE.values.map((v, i) => (
                    <ValueRow
                      key={v}
                      progress={smooth}
                      index={i}
                      title={v}
                      body={ABOUT_PAGE.valueBody}
                      geom={geom}
                    />
                  ))}
                </motion.div>
              </div>

              {/* ✦ WHAT WE BELIEVE SHAPES BETTER WORK. (22:813) */}
              <div className="mt-[clamp(20px,3.3vw,50px)] flex items-center gap-[5px]">
                <Star4 className="w-[12px]" fill="#741a14" />
                <Eyebrow>{ABOUT_PAGE.valuesCaption}</Eyebrow>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AboutBody() {
  return (
    <div className="bg-[#fff3d3] pb-[clamp(72px,13vw,196px)] text-black">
      {/* AT MAPLE, + statement (22:754/752) — 16 bold maroon + 30.22 Medium */}
      <section className="pl-[9.66%] pr-[8%] pt-[clamp(56px,7.47vw,113px)]">
        <Reveal>
          <span className="font-sans-luxury text-[clamp(13px,1.06vw,16px)] font-bold uppercase leading-[1.5] text-[#741a14]">
            {ABOUT_PAGE.atMaple}
          </span>
          <p className="mt-[clamp(6px,0.66vw,10px)] max-w-[643px] font-sans-luxury text-[clamp(19px,2vw,30.2px)] font-medium leading-[1.5] text-black">
            {ABOUT_PAGE.atMapleBody}
          </p>
        </Reveal>
      </section>

      <Rule className="mt-[clamp(32px,5.03vw,76px)]" />

      {/* Badge + mission (22:763-768 / 22:756 / Group 20) */}
      <section className="grid grid-cols-1 gap-12 pl-[9.66%] pr-[11.57%] pt-[clamp(40px,6.55vw,99px)] lg:grid-cols-[68.7%_1fr] lg:gap-0">
        <Reveal>
          <div className="flex h-[79px] w-[clamp(240px,18vw,272px)] overflow-hidden rounded-[4px] border border-[#741a14]">
            <div className="flex w-[37.5%] items-center justify-center bg-[#741a14]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/logo-mark.svg" alt="Maple Studios" className="h-[27px] w-auto" />
            </div>
            <div className="flex flex-1 items-center px-3">
              <span className="font-sans-luxury text-[9px] font-bold uppercase leading-[1.4] text-[#741a14]">
                {ABOUT_PAGE.badge}
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="flex flex-col gap-6">
          {ABOUT_PAGE.mission.map((m, i) => (
            <p
              key={i}
              className="max-w-[373px] font-sans-luxury text-[clamp(12px,1.06vw,16px)] leading-[1.5] text-black"
            >
              {m}
            </p>
          ))}
          <UnderlineLink
            label={ABOUT_PAGE.missionCta}
            href="/contact"
            width="191px"
            className="mt-[clamp(16px,4vw,61px)]"
          />
        </Reveal>
      </section>

      <Rule starLeft="20.5%" className="mt-[clamp(56px,14.2vw,215px)]" />

      {/* Our values — pinned scroll-through (video reference) */}
      <ValuesSection />
    </div>
  );
}
