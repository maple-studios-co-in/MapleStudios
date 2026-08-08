"use client";

import { ABOUT_DATA } from "@/lib/constants";

export default function AboutSection() {
  return (
    <section
      id="about"
      className="relative isolate py-16 px-6 sm:px-12 text-white overflow-hidden"
    >
      {/* Backdrop (hero radial + cycling shades) is painted by StripExit
          across this band AND its runway — one continuous scene, no seam. */}
      {/* The statement, divider and mission columns all compose inside the
          HERO pin (Scene B) — this section is the marquee screen that follows
          (vertically centred, no dead band) and takes the cream strip exit. */}

      {/* Infinite Marquee Banner — words separated by the Figma 24px star
          (exact svg); hover pauses, no color change */}
      {/* No top border — the marquee lives on the same continuous gradient
          scene as the hero/about, a rule here read as a section break */}
      <div className="w-full pt-8 overflow-hidden select-none">
        <div className="animate-marquee whitespace-nowrap flex items-center gap-[3vw]">
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              className="flex items-center gap-[3vw] font-serif-luxury text-[clamp(64px,9.37vw,141.6px)] tracking-[0.05em] text-[#fff3d3] font-normal uppercase"
            >
              {ABOUT_DATA.marqueeText
                .split("✦")
                .map((w) => w.trim())
                .filter(Boolean)
                .map((word, wi) => (
                  <span key={word} className="flex items-center gap-[3vw]">
                    {word}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="star-twinkle aspect-square w-[clamp(14px,1.59vw,24px)] shrink-0"
                      style={{ animationDelay: `${((i * 3 + wi) % 5) * 0.55}s` }}
                      aria-hidden="true"
                    >
                      <path
                        d="M11.9824 0.876953C12.5356 3.9958 13.7265 6.52544 15.5811 8.42188C17.424 10.3064 19.9115 11.5525 23.0479 12.1406C19.9126 12.646 17.4512 13.8353 15.6152 15.6768C13.763 17.5346 12.5587 20.0435 11.9326 23.1494C11.3843 20.0429 10.2538 17.5178 8.43652 15.6611C6.62345 13.8088 4.14106 12.6354 0.912109 12.2012C4.11282 11.4892 6.57827 10.2661 8.39551 8.41113C10.2177 6.55112 11.3739 4.07043 11.9824 0.876953Z"
                        fill="#FFF3D3"
                        stroke="white"
                        strokeWidth="0.288524"
                      />
                    </svg>
                  </span>
                ))}
            </span>
          ))}
        </div>
        <div className="text-center mt-6">
          <span className="text-[11px] font-sans-luxury tracking-widest text-[#fff3d3]/80 uppercase font-semibold">
            {ABOUT_DATA.bottomSub}
          </span>
        </div>
      </div>
    </section>
  );
}
