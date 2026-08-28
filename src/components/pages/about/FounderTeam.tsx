"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimate, useInView } from "motion/react";
import { ABOUT_PAGE } from "@/lib/constants";
import { Reveal, UnderlineLink } from "../PageKit";
import BlurTextReveal from "@/components/common/BlurTextReveal";

/**
 * Founder + Team sections (Figma 2124:211 and the lower region of
 * 2124:105), appended below Our values. Geometry carried as % of the
 * 1512-wide frame per the repo convention; the card cluster lives in an
 * aspect-locked box (1512x1334) so the hand-placed connector lines keep
 * their exact Figma angles at every viewport width.
 *
 * Card ENTRANCE — when the cluster is 30% visible each card floats in
 * from a different spot around the viewport (left edge, top edge, right
 * edge — NEVER the bottom/footer band), arcing on split x/y eases with a
 * slight tilt that settles upright, then aligns into the V formation.
 * Origins are viewport-relative, measured at trigger time. Plays ONCE
 * per page load (trionn's trigger model: IntersectionObserver fires,
 * then disconnects) — scrolling away and back never replays it; only a
 * fresh load does. Cards stay draggable, and dropping one on the centre
 * frame plays that member's mask-off video (the "identify" mechanic).
 */

/* ————— Founder (2124:211) — full-bleed portrait with overlaid type ————— */
export function FounderSection() {
  return (
    <section className="relative mt-[max(96px,15vw)] w-full">
      <div className="relative w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/figma/about/founder-hero.webp"
          alt="Aditya Agrawal, founder of Maple Studios"
          className="block aspect-[1522/1277] w-full object-cover"
        />

        {/* Aditya Agrawal — Catilde SemiBold 100 cream, per-char reveal */}
        <div className="absolute left-[5.62%] top-[0.6%]">
          <BlurTextReveal
            as="h2"
            mode="chars"
            text={ABOUT_PAGE.founder.name}
            className="font-serif-luxury text-[max(40px,6.61vw)] font-semibold leading-normal text-[#fff3d3]"
          />
        </div>

        {/* FOUNDER & CEO — Red Hat Medium 40 white, centre-anchored (2124:213) */}
        <div className="absolute left-[5.62%] top-[20.4%] -translate-y-1/2">
          <BlurTextReveal
            as="p"
            mode="chars"
            text={ABOUT_PAGE.founder.role}
            className="font-sans-luxury text-[max(18px,2.65vw)] font-medium leading-[1.5] text-white"
          />
        </div>

        {/* hanging opening quote + statement (2124:215/214) — the first
            line indents past the rotated quote glyph, Figma-style */}
        <div className="absolute left-[5.62%] top-[52%] w-[84%] md:top-[57%] md:w-[70.2%]">
          <div className="relative">
            {/* Desktop: the glyph hangs in the first line's indent, Figma
                style. Phone: the type is only ~15px, so a hanging glyph is
                taller than a line and struck through line two — sit it on its
                own line above instead and zero the indent. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figma/about/quote-mark.svg"
              alt=""
              className="relative mb-1 block w-[26px] rotate-180 md:absolute md:left-0 md:top-[0.06em] md:mb-0 md:w-[max(34px,5.29vw)]"
            />
            <BlurTextReveal
              text={ABOUT_PAGE.founder.statement}
              style={{ textIndent: "var(--quote-indent)" }}
              className="font-sans-luxury text-[max(15px,4.63vw)] font-medium leading-[1.06] text-[#fff3d3] [--quote-indent:0px] md:leading-none md:[--quote-indent:max(50px,7.3vw)]"
            />
          </div>
        </div>

        {/* supporting paragraph, lower right (2124:221) — overlaid from md
            up; on phones the band is far too short to hold it as well */}
        <Reveal delay={0.08} className="absolute left-[61.57%] top-[89.2%] hidden w-[33.7%] -translate-y-1/2 md:block">
          <p className="font-sans-luxury text-[max(12px,1.46vw)] font-medium leading-[1.5] text-white">
            {ABOUT_PAGE.founder.body}
          </p>
        </Reveal>
      </div>

      {/* same paragraph, stacked under the band on phones */}
      <Reveal delay={0.08} className="px-[9.66%] pt-[max(20px,3vw)] md:hidden">
        <p className="font-sans-luxury text-[15px] font-medium leading-[1.5] text-black">
          {ABOUT_PAGE.founder.body}
        </p>
      </Reveal>
    </section>
  );
}

/* ————— Team (2124:222-250) ————— */

type CardSpec = {
  left: number; // % of cluster width
  top: number; // % of cluster height
  width: number; // % of cluster width
  img: "a" | "b";
  mirror?: boolean;
  float?: number; // phase seconds; undefined = static
};

// positions from Figma, cards scaled to 0.85x with their slot CENTERS
// preserved (the requested "a bit smaller" without disturbing the V)
const CARDS: CardSpec[] = [
  { left: 5.23, top: 2.25, width: 17.99, img: "a" },
  { left: 22.22, top: 7.14, width: 15.74, img: "a" },
  { left: 9.31, top: 22.23, width: 17.09, img: "a", float: 0 },
  { left: 24.74, top: 29.78, width: 15.74, img: "a", float: 0.55 },
  { left: 17.4, top: 47.32, width: 15.74, img: "b", float: 1.1 },
  { left: 76.52, top: 2.25, width: 17.99, img: "a", mirror: true },
  { left: 61.77, top: 7.14, width: 15.74, img: "a", mirror: true },
  { left: 73.34, top: 22.23, width: 17.09, img: "a", mirror: true, float: 0.3 },
  { left: 59.26, top: 29.78, width: 15.74, img: "a", mirror: true, float: 0.85 },
  { left: 67.26, top: 47.32, width: 15.74, img: "b", mirror: true, float: 1.4 },
];

// reveal-frame geometry (% of cluster) — single source for the JSX and
// the entrance math below
const FRAME = { left: 36.64, top: 62.52, width: 26.46 };

// per-card entrance origin: a point around the viewport each card floats
// in from. `at` is a fraction of the viewport (y for side edges, x for
// the top edge). Left-wing cards arrive from the left, right-wing from
// the right, alternates drop from along the top — never the bottom, so
// nothing rises out of the footer. Side origins cap at 74% of viewport
// height for the same reason.
type Origin = { edge: "left" | "top" | "right"; at: number };
const ORIGINS: Origin[] = [
  { edge: "left", at: 0.22 },
  { edge: "top", at: 0.28 },
  { edge: "left", at: 0.55 },
  { edge: "top", at: 0.42 },
  { edge: "left", at: 0.74 },
  { edge: "right", at: 0.22 },
  { edge: "top", at: 0.72 },
  { edge: "right", at: 0.55 },
  { edge: "top", at: 0.58 },
  { edge: "right", at: 0.74 },
];
// split eases bow the flight path into an arc: the dominant axis escapes
// fast (glide) while the other catches up late (lag)
const GLIDE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const LAG: [number, number, number, number] = [0.4, 0.05, 0.15, 1];
const SETTLE: [number, number, number, number] = [0.34, 1.4, 0.64, 1];

// idle float variants hoisted so re-renders (lift/reveal state) never
// hand motion a fresh animate object mid-drag. Delays sit past the last
// landing (delay 0.05 + 0.085*9 + duration 2.26 ≈ 3.08s) — ambient motion
// holds until every card has settled. Both wings float: left phases
// 0/0.55/1.1, right 0.3/0.85/1.4 so the pack breathes, never seesaws.
const FLOAT_ANIM: Record<number, object> = {};
for (const phase of [0, 0.3, 0.55, 0.85, 1.1, 1.4]) {
  FLOAT_ANIM[phase] = {
    animate: { y: [0, -10, 0], x: [0, -2, 2, 0] },
    transition: { duration: 4, repeat: Infinity, ease: "easeInOut" as const, delay: 3.1 + phase },
  };
}

// hairline connectors (1px black @ 33%): center x/y %, width %, rotation
const LINES: [number, number, number, number][] = [
  [42.63, 44.3, 34.63, -104.04],
  [26.75, 46.66, 49.78, -143.75],
  [43.09, 58.21, 11.75, -129.52],
  [31.35, 55.96, 33.58, -157.17],
  [40.05, 62.26, 13.69, -171.95],
  [70.54, 55.55, 29.12, -24.99],
  [71.43, 41.3, 46.85, -53.03],
  [58.27, 46.14, 35.35, -79.22],
  [58.76, 58.21, 10.66, -58.18],
  [62.24, 62.26, 9.97, -11.09],
];

const MEMBER_SRC = {
  a: "/figma/about/team-member-a.webp",
  b: "/figma/about/team-member-b.webp",
} as const;
// each member's mask-off clip (trionn's "identify" payoff); one clip for
// now — add per-member files here as they're produced
const MEMBER_VIDEO = {
  a: "/video/team/nilesh.mp4",
  b: "/video/team/nilesh.mp4",
} as const;

function MemberCard({
  spec,
  index,
  entered,
  clusterRef,
  frameRef,
  onReveal,
}: {
  spec: CardSpec;
  index: number;
  entered: boolean;
  clusterRef: React.RefObject<HTMLDivElement | null>;
  frameRef: React.RefObject<HTMLDivElement | null>;
  onReveal: (img: "a" | "b") => void;
}) {
  const [scope, animate] = useAnimate();
  const [outerScope, animateOuter] = useAnimate();
  const flown = useRef(false);
  const placing = useRef(false);
  // z-order: each card wrapper creates its own stacking context (transform
  // + z), so an inner zIndex can NEVER escape it — the wrapper itself must
  // outrank the frame (z-20) or the card slides BEHIND the box during
  // entrance and drag. Cards rest above the frame and lift while in hand.
  const [lifted, setLifted] = useState(false);

  // entrance: measure the slot's viewport position once `entered` flips,
  // then fly in from this card's ORIGINS point. Origins are viewport-
  // relative so they genuinely read as "from around the screen" at any
  // window size; deltas are captured at fire time, so the card always
  // lands exactly in its slot even if the user keeps scrolling.
  useEffect(() => {
    if (!entered || flown.current) return;
    flown.current = true;
    const el = outerScope.current as HTMLDivElement | null;
    if (!el) return;
    const o = ORIGINS[index];
    const r = el.getBoundingClientRect();
    const inset = 28; // gap between an origin and the viewport edge
    let ox: number, oy: number;
    if (o.edge === "top") {
      ox = o.at * window.innerWidth;
      oy = inset + r.height / 2;
    } else {
      ox = o.edge === "left" ? inset + r.width / 2 : window.innerWidth - inset - r.width / 2;
      oy = Math.min(o.at, 0.74) * window.innerHeight;
    }
    const dx = ox - (r.left + r.width / 2);
    const dy = oy - (r.top + r.height / 2);
    const tilt = o.edge === "left" ? -9 : o.edge === "right" ? 9 : index % 2 ? 6 : -6;
    // unhurried drift — stretched ~45% from the first cut for a calmer,
    // more aesthetic glide into formation
    const delay = 0.05 + 0.085 * index;
    const duration = 1.9 + (index % 3) * 0.18; // organic per-card variety
    animateOuter(
      el,
      { x: [dx, 0], y: [dy, 0], rotate: [tilt, 0], opacity: [0, 1] },
      {
        x: { delay, duration, ease: o.edge === "top" ? LAG : GLIDE },
        y: { delay, duration, ease: o.edge === "top" ? GLIDE : LAG },
        rotate: { delay, duration, ease: SETTLE },
        opacity: { delay, duration: 0.7, ease: "easeOut" },
      }
    );
  }, [entered, index, animateOuter, outerScope]);

  // float waits for `entered` so slots hold still while the pack flies in
  const floatAnim = spec.float !== undefined && entered ? FLOAT_ANIM[spec.float] : {};
  return (
    // three layers so no two animations fight over one transform:
    // outer = entrance flight, mid = idle float, inner = drag + placement
    <motion.div
      ref={outerScope}
      initial={{ opacity: 0 }}
      style={{
        left: `${spec.left}%`,
        top: `${spec.top}%`,
        width: `${spec.width}%`,
        zIndex: lifted ? 45 : 30,
        // no permanent will-change: motion applies it for the duration of an
        // animation on its own, and ten pinned card layers (plus their
        // connector lines) is exactly the WebKit layer pressure that made
        // this page flicker once it had settled
      }}
      className="absolute aspect-[4/5]"
    >
      <motion.div className="size-full" {...floatAnim}>
        <motion.div
          ref={scope}
          className="size-full cursor-grab active:cursor-grabbing"
          drag
          dragConstraints={clusterRef}
          dragElastic={0.12}
          whileDrag={{ scale: 1.04 }}
          onDragStart={() => setLifted(true)}
          onDragEnd={async (_, info) => {
            const el = scope.current as HTMLDivElement | null;
            const frame = frameRef.current;
            if (!el || !frame) return;
            if (placing.current) {
              // never leave a card stranded where it was dropped — even on
              // the guard path it must travel home
              animate(el, { x: 0, y: 0 }, { type: "spring", stiffness: 380, damping: 26 });
              setLifted(false);
              return;
            }
            // info.point is PAGE-based; rects are viewport-based — offset
            // by the scroll position or a scrolled page never registers
            const r = frame.getBoundingClientRect();
            const px = info.point.x - window.scrollX;
            const py = info.point.y - window.scrollY;
            const hit = px > r.left && px < r.right && py > r.top && py < r.bottom;
            if (!hit) {
              // manual snap-back (dragSnapToOrigin can't be interrupted
              // by the placement flight, so return is manual too)
              await animate(el, { x: 0, y: 0 }, { type: "spring", stiffness: 380, damping: 26 });
              setLifted(false);
              return;
            }
            // ——— place the card ONTO the frame: same 4/5 aspect, so a
            // translate + uniform scale lands it as an exact fit, arriving
            // from above thanks to the lifted wrapper z ———
            placing.current = true;
            el.style.pointerEvents = "none";
            try {
              const cr = el.getBoundingClientRect();
              const mtx = new DOMMatrixReadOnly(
                getComputedStyle(el).transform === "none" ? "" : getComputedStyle(el).transform
              );
              const dx = r.left + r.width / 2 - (cr.left + cr.width / 2);
              const dy = r.top + r.height / 2 - (cr.top + cr.height / 2);
              await animate(
                el,
                { x: mtx.m41 + dx, y: mtx.m42 + dy, scale: r.width / el.offsetWidth },
                { type: "spring", stiffness: 240, damping: 28 }
              );
              onReveal(spec.img);
              await animate(el, { opacity: 0 }, { duration: 0.22 });
              await animate(el, { x: 0, y: 0, scale: 1 }, { duration: 0 });
              setLifted(false);
              // interactive again the moment it is back in its slot — the
              // old flow kept pointer-events off through the whole fade-in
              // (+delay), a ~1s dead zone where grabbing the card silently
              // did nothing
              el.style.pointerEvents = "";
              placing.current = false;
              await animate(el, { opacity: 1 }, { duration: 0.45, delay: 0.1 });
            } finally {
              // whatever happens mid-flight (interrupted animation, HMR,
              // unmount race) the card must never stay locked
              el.style.pointerEvents = "";
              placing.current = false;
              setLifted(false);
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MEMBER_SRC[spec.img]}
            alt="Maple Studios team member"
            draggable={false}
            className={`pointer-events-none size-full rounded-[8px] object-cover shadow-[-4px_4px_25px_0px_rgba(0,0,0,0.25)] ${
              spec.mirror ? "scale-x-[-1]" : ""
            }`}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* biometric scan pass over the seated card — red sweep + targeting
   brackets + IDENTIFYING… label, then a DETECTED flash (trionn's
   "identify" beat; their build even voices "Identifying. / Detected.")
   before the member video is allowed to play */
function ScanOverlay({ onDone }: { onDone: () => void }) {
  const [detected, setDetected] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setDetected(true), 1500);
    const t2 = setTimeout(onDone, 2050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* red pass tint */}
      <motion.div
        animate={detected ? { opacity: 0.3 } : { opacity: [0.1, 0.2, 0.1] }}
        transition={detected ? { duration: 0.1 } : { duration: 0.9, repeat: Infinity }}
        className="absolute inset-0 bg-red-600/40 mix-blend-multiply"
      />
      {/* sweeping laser line */}
      {!detected && (
        <motion.div
          initial={{ top: "3%" }}
          animate={{ top: ["3%", "95%", "3%"] }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          className="absolute left-0 h-[3px] w-full bg-red-500 shadow-[0_0_18px_5px_rgba(239,68,68,0.65)]"
        />
      )}
      {/* targeting brackets */}
      {(
        [
          "left-2 top-2 border-l-2 border-t-2",
          "right-2 top-2 border-r-2 border-t-2",
          "left-2 bottom-2 border-l-2 border-b-2",
          "right-2 bottom-2 border-r-2 border-b-2",
        ] as const
      ).map((pos) => (
        <motion.div
          key={pos}
          animate={detected ? { scale: 1.12, opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
          transition={detected ? { duration: 0.15 } : { duration: 0.9, repeat: Infinity }}
          className={`absolute size-[22px] border-red-500 ${pos}`}
        />
      ))}
      {/* detect flash */}
      {detected && (
        <motion.div
          initial={{ opacity: 0.45 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-0 bg-red-500"
        />
      )}
      {/* status label */}
      <div className="absolute inset-x-0 bottom-4 flex justify-center">
        <motion.span
          animate={detected ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
          transition={detected ? { duration: 0.1 } : { duration: 0.7, repeat: Infinity }}
          className="rounded-sm bg-black/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-red-400"
        >
          {detected ? "Detected." : "Identifying…"}
        </motion.span>
      </div>
    </div>
  );
}

export function TeamSection() {
  const clusterRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState<{ img: "a" | "b"; n: number; phase: "scan" | "play" } | null>(null);
  // trionn's trigger verbatim: IntersectionObserver at threshold 0.3 that
  // disconnects after firing — deal plays once per page load, never on
  // re-entry (only a refresh brings it back)
  const entered = useInView(clusterRef, { once: true, amount: 0.3 });

  return (
    <section className="relative w-full pt-[max(48px,7.47vw)]">
      {/* Different skills, / one standard — staggered centres, per-char
          trionn heading reveal (2124:222/223) */}
      <div className="relative text-center">
        <BlurTextReveal
          as="p"
          mode="chars"
          text={ABOUT_PAGE.team.headline1}
          className="relative left-0 font-serif-luxury text-[max(30px,9.37vw)] font-normal leading-[0.7] text-[#741a14] md:left-[-7.21%]"
        />
        <BlurTextReveal
          as="p"
          mode="chars"
          text={ABOUT_PAGE.team.headline2}
          className="relative left-0 mt-[max(10px,0.86vw)] font-serif-luxury text-[max(30px,9.37vw)] font-normal leading-[0.7] text-[#741a14] md:left-[8.23%]"
        />
      </div>

      {/* card cluster — aspect-locked to the Figma geometry (1512x1334) */}
      <div
        ref={clusterRef}
        className="relative mt-[max(140px,37.7vw)] aspect-[1512/1334] w-full overflow-x-clip"
      >
        {/* each hairline pairs with CARDS[i]; when that card floats, its
            line carries the SAME hoisted keyframes/phase, so the pair moves
            rigidly and the line never detaches from its card. Positioning
            lives on the outer motion wrapper, the centring translate +
            Figma rotation on the inner strip — two transforms, no fight */}
        {LINES.map(([cx, cy, w, deg], i) => (
          <motion.div
            key={i}
            style={{ left: `${cx}%`, top: `${cy}%`, width: `${w}%` }}
            className="absolute"
            {...(CARDS[i].float !== undefined && entered ? FLOAT_ANIM[CARDS[i].float] : {})}
          >
            <div
              style={{ transform: `translate(-50%, -50%) rotate(${deg}deg)` }}
              className="h-px w-full bg-black/[0.33]"
            />
          </motion.div>
        ))}

        {CARDS.map((spec, i) => (
          <MemberCard
            key={i}
            spec={spec}
            index={i}
            entered={entered}
            clusterRef={clusterRef}
            frameRef={frameRef}
            onReveal={(img) => setRevealed((r) => ({ img, n: (r?.n ?? 0) + 1, phase: "scan" }))}
          />
        ))}

        {/* central reveal frame (2124:244/246) — dropping a member plays
            their mask-off clip, trionn's "identify" moment */}
        <div
          ref={frameRef}
          style={{ left: `${FRAME.left}%`, top: `${FRAME.top}%`, width: `${FRAME.width}%` }}
          className="absolute z-20 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-[10px] border-[0.5px] border-[#8d7d50] bg-[#fff8e4] shadow-[-4px_2px_25px_0px_rgba(0,0,0,0.1)]"
        >
          {revealed ? (
            <>
              {/* poster: the seated card's photo stays under the scan pass,
                  so the card can fade away seamlessly above it */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={MEMBER_SRC[revealed.img]}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
              {revealed.phase === "scan" ? (
                <ScanOverlay
                  key={revealed.n}
                  onDone={() => setRevealed((r) => (r ? { ...r, phase: "play" } : r))}
                />
              ) : (
                <motion.video
                  key={revealed.n}
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  src={MEMBER_VIDEO[revealed.img]}
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  className="absolute inset-0 size-full object-cover"
                />
              )}
            </>
          ) : (
            <span className="px-4 text-center font-sans-luxury text-[max(11px,0.93vw)] font-bold uppercase leading-[1.2] text-[#741a14]">
              {ABOUT_PAGE.team.dragHint}
            </span>
          )}
        </div>
      </div>

      {/* JOIN OUR TEAM (2124:248-250) */}
      <div className="mt-[max(40px,5.29vw)] flex justify-center">
        <UnderlineLink label={ABOUT_PAGE.team.cta} href="/contact" width="241px" />
      </div>
    </section>
  );
}
