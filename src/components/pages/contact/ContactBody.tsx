"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CONTACT_PAGE } from "@/lib/constants";
import { Eyebrow, HERO_GRADIENT, Reveal, Rule } from "../PageKit";
import GradientCycler from "@/components/common/GradientCycler";
import MapleOutlineMark from "@/components/common/MapleOutlineMark";

/** Gradient hero: cream outline M mark, big Catilde title, cycling shades. */
export function ContactHero() {
  return (
    <section
      className="relative isolate flex flex-col items-center justify-center overflow-hidden px-6 pb-[max(56px,7vw)] pt-[max(140px,15vw)] text-center"
      style={{ background: HERO_GRADIENT }}
    >
      <GradientCycler />
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.9, ease: "easeOut" }}
      >
        <MapleOutlineMark className="w-[max(150px,18.5vw)]" />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.7, delay: 0.3 }}
        className="mt-[max(20px,2.6vw)] font-serif-luxury text-[max(40px,5.29vw)] font-normal leading-normal text-[#fff3d3]"
      >
        {CONTACT_PAGE.hero.title}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, delay: 0.55 }}
        className="mt-4 max-w-[430px] font-sans-luxury text-[max(13px,1.19vw)] leading-normal text-white"
      >
        {CONTACT_PAGE.hero.subtitle}
      </motion.p>

      <div className="relative mt-10 size-[max(20px,1.323vw)]" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/scroll-circle.svg" alt="" className="absolute inset-0 size-full" />
      </div>
    </section>
  );
}

/** Maroon region: form + Location/Join us columns. */
export function ContactMaroon() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = CONTACT_PAGE.fields
      .map((f) => `${f.label.replace("*", "")}: ${values[f.id] ?? ""}`)
      .join("\n");
    setSent(true);
    window.location.href = `mailto:${CONTACT_PAGE.email}?subject=${encodeURIComponent(
      "New project enquiry"
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="relative isolate" style={{ background: HERO_GRADIENT }}>
      <GradientCycler />
      <section className="px-[8%] pb-[max(64px,8vw)] pt-[max(64px,8vw)]">
        {/* Note + step counter */}
        <Reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <p className="max-w-[320px] font-sans-luxury text-[16px] font-bold uppercase leading-[1.5] text-[#fff3d3]">
            {CONTACT_PAGE.note}
          </p>
          <span className="flex items-center gap-4">
            <span className="h-px w-[40px] bg-[#fff3d3]/60" />
            <span className="font-sans-luxury text-[max(14px,0.926vw)] font-bold text-[#fff3d3]">
              {CONTACT_PAGE.step}
            </span>
          </span>
        </Reveal>

        {/* Heading */}
        <Reveal delay={0.05} className="mt-[max(40px,5vw)]">
          <h2 className="font-serif-luxury text-[max(34px,4.17vw)] font-normal leading-normal text-[#fff3d3]">
            {CONTACT_PAGE.formHeading}
          </h2>
          <p className="mt-4 font-sans-luxury text-[max(13px,1.06vw)] text-[#fff3d3]/90">
            {CONTACT_PAGE.formSub}
          </p>
        </Reveal>

        {/* Form */}
        <Reveal delay={0.1} className="mt-[max(32px,4vw)]">
          <form onSubmit={submit} className="flex w-full max-w-[63.6%] flex-col gap-[22px] max-lg:max-w-full">
            {CONTACT_PAGE.fields.map((f) => (
              <input
                key={f.id}
                type={f.type}
                required={f.required}
                placeholder={f.label}
                value={values[f.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                aria-label={f.label}
                className="h-[62px] w-full rounded-[8px] border border-[#fff3d3]/35 bg-transparent px-6 font-sans-luxury text-[15px] text-[#fff3d3] outline-none transition-colors placeholder:text-[#fff3d3]/70 focus:border-[#fff3d3]"
              />
            ))}

            <div className="mt-2 flex flex-col items-end gap-3">
              <button type="submit" className="group flex w-[191px] cursor-pointer flex-col">
                <span className="flex items-center justify-between">
                  <span className="font-sans-luxury text-[max(14px,0.926vw)] font-bold uppercase text-[#fff3d3]">
                    {CONTACT_PAGE.submit}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/figma/arrow-cream.svg"
                    alt=""
                    className="w-[max(15px,0.992vw)] transition-transform duration-300 group-hover:translate-x-1"
                  />
                </span>
                <span className="mt-[9px] h-px w-full bg-[#fff3d3]" />
              </button>
              {sent ? (
                <span className="font-sans-luxury text-[13px] text-[#fff3d3]/80">
                  Thanks — opening your mail app.
                </span>
              ) : null}
            </div>
          </form>
        </Reveal>
      </section>

      <Rule tone="cream" />

      {/* Location / Join us */}
      <section className="grid grid-cols-1 gap-10 px-[8%] pb-[max(80px,10vw)] pt-[max(48px,6vw)] lg:grid-cols-3">
        {CONTACT_PAGE.columns.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.08}>
            <h3 className="font-serif-luxury text-[max(34px,4.76vw)] font-normal leading-normal text-[#fff3d3]">
              {c.title}
            </h3>
            <p className="mt-5 max-w-[330px] font-sans-luxury text-[max(14px,0.926vw)] leading-normal text-[#fff3d3]/90">
              {c.body}
            </p>
          </Reveal>
        ))}
        <Reveal delay={0.16} className="lg:pt-[max(60px,7vw)]">
          <a
            href={`mailto:${CONTACT_PAGE.email}`}
            className="font-sans-luxury text-[max(16px,1.72vw)] font-bold text-[#fff3d3] transition-opacity hover:opacity-80"
          >
            {CONTACT_PAGE.email}
          </a>
          <p className="mt-3 font-sans-luxury text-[max(14px,0.926vw)] text-[#fff3d3]/70">
            {CONTACT_PAGE.emailNote}
          </p>
        </Reveal>
      </section>
    </div>
  );
}

/** Cream "Questions" accordion. */
export function ContactQuestions() {
  const [open, setOpen] = useState(0);

  return (
    <section className="bg-[#fff3d3] px-[2%] pb-[max(64px,8vw)] pt-[max(72px,9vw)] text-black">
      <Reveal className="text-center">
        <h2 className="font-serif-luxury text-[max(56px,6.61vw)] font-normal leading-normal text-[#741a14]">
          {CONTACT_PAGE.faqHeading}
        </h2>
        <p className="mx-auto mt-5 max-w-[320px] font-sans-luxury text-[16px] font-bold uppercase leading-[1.5] text-black">
          {CONTACT_PAGE.note}
        </p>
      </Reveal>

      <div className="mt-[max(48px,6vw)]">
        {CONTACT_PAGE.faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q} className="border-t border-black/30 last:border-b">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="grid w-full cursor-pointer grid-cols-[48px_1fr_48px] items-center gap-4 px-[2%] py-7 text-left"
              >
                <span className="font-sans-luxury text-[max(15px,1.32vw)] text-black">
                  {i + 1}.
                </span>
                <span className="font-sans-luxury text-[max(17px,1.65vw)] font-bold text-black md:text-center">
                  {f.q}
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="justify-self-end font-sans-luxury text-[18px] text-[#741a14]"
                  aria-hidden="true"
                >
                  ↓
                </motion.span>
              </button>

              <motion.div
                initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-8 px-[2%] pb-10 pl-[calc(2%+48px)] md:grid-cols-2">
                  <div>
                    <Eyebrow color="#000">{f.platformsLabel}</Eyebrow>
                    <ul className="mt-3 flex flex-col gap-1">
                      {f.platforms.map((p) => (
                        <li key={p} className="font-sans-luxury text-[max(14px,0.926vw)] text-black">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <Eyebrow color="#000">{f.coreLabel}</Eyebrow>
                    <ul className="mt-3 flex flex-col gap-1">
                      {f.core.map((p) => (
                        <li key={p} className="font-sans-luxury text-[max(14px,0.926vw)] text-black">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
