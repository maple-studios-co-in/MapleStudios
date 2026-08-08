"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, VolumeX, X, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import LogoMark from "@/components/common/LogoMark";
import GradientCycler from "@/components/common/GradientCycler";

export default function Navbar() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // true when the section under the navbar is light (cream) — swaps the
  // cream/white chrome for maroon so the nav never disappears.
  const [onLight, setOnLight] = useState(false);
  // true once scrolled past the hero — the Maple Studios lockup dims so the
  // fixed logo never fights the content underneath it.
  const [pastHero, setPastHero] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const toggleSound = () => {
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    let raf = 0;
    /** An element's real on-screen alpha: its own `opacity` multiplied by
        every ancestor's. Crossfade layers (the services stage's black sheet,
        the film) sit at opacity 0 with a SOLID background-color — reading
        the colour alone made the bar go dark over a cream screen. */
    const effectiveAlpha = (el: Element) => {
      let a = 1;
      let n: Element | null = el;
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        if (cs.visibility === "hidden" || cs.display === "none") return 0;
        a *= parseFloat(cs.opacity || "1");
        if (a < 0.05) return 0;
        n = n.parentElement;
      }
      return a;
    };
    const sample = () => {
      const header = headerRef.current;
      // probe the element stack under the middle of the navbar
      const els = document.elementsFromPoint(window.innerWidth / 2, 90);
      let light = false;
      for (const el of els) {
        if (header && header.contains(el)) continue;
        const bg = getComputedStyle(el).backgroundColor;
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) continue;
        const colorAlpha = m[4] === undefined ? 1 : parseFloat(m[4]);
        // see through translucent layers AND faded-out crossfade sheets
        if (colorAlpha * effectiveAlpha(el) < 0.5) continue;
        const luminance = 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3];
        light = luminance > 160;
        break;
      }
      setOnLight(light);
      setPastHero(window.scrollY > window.innerHeight * 0.8);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sample);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Springs and time-based choreographies (strip exit, pinned scenes)
    // repaint the background WITHOUT scroll events — re-sample on a short
    // interval too so the chrome never lags the backdrop mid-transition.
    const tick = setInterval(onScroll, 250);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      clearInterval(tick);
      cancelAnimationFrame(raf);
    };
  }, []);

  const ink = onLight ? "text-[#741a14]" : "text-[#fff3d3]";
  const line = onLight ? "bg-[#741a14]" : "bg-[#d8d8d8]";

  return (
    <>
      <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 px-5 sm:px-8 py-6 transition-all duration-300">
        {/* Full-bleed: logo pinned to the far left, controls to the far right */}
        <div className="flex w-full items-center justify-between">
          {/* Logo (Figma P8Asset mark + wordmark) — full strength over the
              hero, dimmed once scrolled into the content (hover restores) */}
          <Link
            href="/"
            className={`flex items-center gap-3 group transition-opacity duration-500 ${
              pastHero ? "opacity-40 hover:opacity-90" : "opacity-100"
            }`}
          >
            <LogoMark className={`h-[27px] w-auto transition-colors duration-300 ${ink}`} />
            <span className={`font-serif-luxury text-2xl tracking-wide transition-colors duration-300 ${ink}`}>
              Maple Studios
            </span>
          </Link>

          {/* Right Navigation Controls */}
          <div className="flex items-center gap-3">
            {/* Audio Toggle Pill */}
            <button
              onClick={toggleSound}
              aria-label="Toggle Sound"
              className={`px-3 py-2 rounded-full flex items-center gap-2 text-xs font-sans-luxury tracking-wider transition-all cursor-pointer border ${
                onLight
                  ? "border-[#741a14]/25 bg-[#741a14]/10 text-[#741a14] hover:bg-[#741a14]/20"
                  : "border-white/10 bg-white/10 text-white/90 hover:bg-white/15"
              }`}
            >
              {isPlaying ? (
                <Volume2 className={`w-3.5 h-3.5 animate-pulse ${onLight ? "text-[#741a14]" : "text-amber-200"}`} />
              ) : (
                <VolumeX className={`w-3.5 h-3.5 ${onLight ? "text-[#741a14]/60" : "text-white/60"}`} />
              )}
              <div className="flex items-center gap-0.5 h-3">
                <span className={`w-0.5 rounded-full transition-all duration-300 ${onLight ? "bg-[#741a14]/80" : "bg-white/80"} ${isPlaying ? "h-3 animate-bounce" : "h-1.5"}`} />
                <span className={`w-0.5 rounded-full transition-all duration-300 delay-75 ${onLight ? "bg-[#741a14]/80" : "bg-white/80"} ${isPlaying ? "h-2 animate-bounce" : "h-2.5"}`} />
                <span className={`w-0.5 rounded-full transition-all duration-300 delay-150 ${onLight ? "bg-[#741a14]/80" : "bg-white/80"} ${isPlaying ? "h-3.5 animate-bounce" : "h-1"}`} />
              </div>
            </button>

            {/* Let's Talk Button — solid pill, inverted per background */}
            <Link
              href="/contact"
              className={`px-4 py-2 rounded-full text-xs font-sans-luxury font-medium tracking-wider transition-all duration-300 shadow-lg hover:shadow-xl uppercase border ${
                onLight
                  ? "bg-[#741a14] border-[#741a14] text-[#fff3d3] hover:bg-transparent hover:text-[#741a14]"
                  : "bg-white border-white text-black hover:bg-transparent hover:text-white"
              }`}
            >
              LET&apos;S TALK
            </Link>

            {/* Menu Button — outlined pill, inked per background */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`border px-4 py-2 rounded-full text-xs font-sans-luxury font-medium tracking-wider transition-all duration-300 uppercase flex items-center gap-2 cursor-pointer ${
                onLight
                  ? "border-[#741a14] text-[#741a14] hover:bg-[#741a14]/10"
                  : "border-white text-white hover:bg-white/15"
              }`}
            >
              <span>MENU</span>
              <span className="flex flex-col gap-[3px]">
                <span className={`h-px w-[11px] transition-colors duration-300 ${line}`} />
                <span className={`h-px w-[11px] transition-colors duration-300 ${line}`} />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Overlay Slide-out Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: "-100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-100%" }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 isolate bg-[#4b0e0c] z-40 flex flex-col justify-between p-8 sm:p-16 text-white"
          >
            {/* same Default→Variant7 shade cycle as every reddish surface */}
            <GradientCycler />
            <div className="flex justify-between items-center max-w-7xl mx-auto w-full pt-16">
              <span className="text-xs uppercase tracking-widest text-white/50 font-sans-luxury">
                Navigation
              </span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="glass-pill p-3 rounded-full hover:bg-white/20 transition-all cursor-pointer"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="max-w-7xl mx-auto w-full my-auto py-12">
              <nav className="flex flex-col gap-6">
                {[
                  { name: "Home", href: "/" },
                  { name: "About Studio", href: "/about" },
                  { name: "Our Work", href: "/work" },
                  { name: "Our Services", href: "/services" },
                  { name: "Contact", href: "/contact" },
                ].map((item, i) => (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setIsMenuOpen(false)}
                      className="group flex items-center justify-between text-4xl sm:text-6xl font-serif-luxury hover:text-[#fff3d3] transition-colors py-2 border-b border-white/10"
                    >
                      <span>{item.name}</span>
                      <ArrowUpRight className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                    </Link>
                  </motion.div>
                ))}
              </nav>
            </div>

            <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row justify-between text-xs text-white/60 font-sans-luxury border-t border-white/10 pt-6">
              <p>© Maple Studios. All rights reserved.</p>
              <p>Designed to mean purpose.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
