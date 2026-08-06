"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Volume2, VolumeX, X, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export default function Navbar() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleSound = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 px-5 sm:px-8 py-6 transition-all duration-300">
        {/* Full-bleed: logo pinned to the far left, controls to the far right */}
        <div className="flex w-full items-center justify-between">
          {/* Logo (Figma P8Asset mark + wordmark) */}
          <Link href="/" className="flex items-center gap-3 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/figma/logo-mark.svg"
              alt="Maple Studios logo"
              className="h-[27px] w-auto"
            />
            <span className="font-serif-luxury text-2xl tracking-wide text-[#fff3d3] group-hover:text-white transition-colors">
              Maple Studios
            </span>
          </Link>

          {/* Right Navigation Controls */}
          <div className="flex items-center gap-3">
            {/* Audio Toggle Pill */}
            <button
              onClick={toggleSound}
              aria-label="Toggle Sound"
              className="glass-pill px-3 py-2 rounded-full flex items-center gap-2 text-xs font-sans-luxury tracking-wider text-white/90 hover:bg-white/15 transition-all cursor-pointer"
            >
              {isPlaying ? (
                <Volume2 className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-white/60" />
              )}
              <div className="flex items-center gap-0.5 h-3">
                <span className={`w-0.5 bg-white/80 rounded-full transition-all duration-300 ${isPlaying ? "h-3 animate-bounce" : "h-1.5"}`} />
                <span className={`w-0.5 bg-white/80 rounded-full transition-all duration-300 delay-75 ${isPlaying ? "h-2 animate-bounce" : "h-2.5"}`} />
                <span className={`w-0.5 bg-white/80 rounded-full transition-all duration-300 delay-150 ${isPlaying ? "h-3.5 animate-bounce" : "h-1"}`} />
              </div>
            </button>

            {/* Let's Talk Button — white pill per Figma 10:7423 */}
            <Link
              href="/contact"
              className="bg-white border border-white px-4 py-2 rounded-full text-xs font-sans-luxury font-medium tracking-wider text-black hover:bg-transparent hover:text-white transition-all duration-300 shadow-lg hover:shadow-xl uppercase"
            >
              LET&apos;S TALK
            </Link>

            {/* Menu Button — outlined pill per Figma 10:7466 */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="border border-white px-4 py-2 rounded-full text-xs font-sans-luxury font-medium tracking-wider text-white hover:bg-white/15 transition-all duration-300 uppercase flex items-center gap-2 cursor-pointer"
            >
              <span>MENU</span>
              <span className="flex flex-col gap-[3px]">
                <span className="h-px w-[11px] bg-[#d8d8d8]" />
                <span className="h-px w-[11px] bg-[#d8d8d8]" />
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
            className="fixed inset-0 bg-[#4b0e0c] z-40 flex flex-col justify-between p-8 sm:p-16 text-white"
          >
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
                      className="group flex items-center justify-between text-4xl sm:text-6xl font-serif-luxury hover:text-amber-200 transition-colors py-2 border-b border-white/10"
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
