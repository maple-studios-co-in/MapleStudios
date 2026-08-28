"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CONTACT_PAGE } from "@/lib/constants";
import { Reveal, Rule } from "../PageKit";
import Fumes from "@/components/common/Fumes";
import MapleOutlineMark from "@/components/common/MapleOutlineMark";
import BookCall from "./BookCall";

/** Hero: transparent over the page's fixed gradient. It is wrapped in a
    pinning StripExit on the page, so the screen holds still while maroon
    strips grow over it. */
export function ContactHero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 pb-[max(56px,7vw)] pt-[max(120px,10vw)] text-center">
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

/* Shared input skin for the trionn-matched form.
   `[&:-webkit-autofill]` block: Chrome paints its own pale-blue autofill
   background over dark inputs, which on this maroon panel looked like the
   field had turned white. The inset shadow re-paints the maroon and the
   text-fill-color keeps the typed value cream. */
const FIELD_CLS =
  "h-[62px] w-full rounded-[8px] border border-[#fff3d3]/35 bg-transparent px-6 font-sans-luxury text-[15px] text-[#fff3d3] outline-none transition-colors placeholder:text-[#fff3d3]/70 focus:border-[#fff3d3] [&:-webkit-autofill]:[-webkit-text-fill-color:#fff3d3] [&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_#741a14_inset]";

/** Same shape as the API's check, so client and server agree on "valid". */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Warning line under a field. */
function FieldError({ msg }: { msg?: string }) {
  return msg ? (
    <p role="alert" className="mt-2 flex items-center gap-1.5 font-sans-luxury text-[12.5px] text-[#ffcf9a]">
      <span aria-hidden="true">!</span>
      {msg}
    </p>
  ) : null;
}

/** Custom picker matching the field skin — a button that unfolds its options
    as a row of choices (service / budget selects on trionn's form). */
function OptionPicker({
  placeholder,
  options,
  value,
  onChange,
  invalid = false,
}: {
  placeholder: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // click-away closes the tray
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${FIELD_CLS} flex cursor-pointer items-center justify-between text-left ${
          invalid ? "border-[#ffcf9a]" : ""
        }`}
      >
        <span className={value ? "text-[#fff3d3]" : "text-[#fff3d3]/70"}>{value || placeholder}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} aria-hidden="true">
          ↓
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-wrap gap-2 rounded-[8px] border border-[#fff3d3]/25 bg-black/20 p-3">
              {options.map((opt) => {
                const active = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(active ? "" : opt);
                      setOpen(false);
                    }}
                    className={`cursor-pointer rounded-full border px-4 py-2 font-sans-luxury text-[12.5px] font-bold transition-colors ${
                      active
                        ? "border-[#fff3d3] bg-[#fff3d3] text-[#741a14]"
                        : "border-[#fff3d3]/40 text-[#fff3d3] hover:border-[#fff3d3]"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** One staggered rise for each form row — the "form loads into the screen"
    choreography that follows the strip transition, trionn-style. */
function FormRow({
  index,
  className = "",
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, filter: "blur(4px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 1.1, delay: 0.12 + index * 0.09, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Maroon region: trionn-matched form + booking + Location/Join us columns. */
export function ContactMaroon() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [service, setService] = useState("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Every required field, checked in one place so the submit handler and the
      per-field messages can never disagree. */
  const validate = () => {
    const next: Record<string, string> = {};
    if (!(values.name ?? "").trim()) next.name = "Please enter your name.";
    const email = (values.email ?? "").trim();
    if (!email) next.email = "Please enter your email address.";
    else if (!EMAIL_RE.test(email)) next.email = "That email address doesn't look right.";
    if (!service) next.service = "Please select a service.";
    if (!budget) next.budget = "Please select an estimated budget.";
    if (!message.trim()) next.message = "Please tell us a little about the project.";
    return next;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // put the visitor on the first problem rather than making them hunt
      document
        .querySelector<HTMLElement>("[data-invalid='true']")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const lines = [
      ...CONTACT_PAGE.fields.map((f) => `${f.label}: ${values[f.id] ?? ""}`),
      `Service: ${service}`,
      `Estimated budget: ${budget}`,
      "",
      message,
    ];
    setSent(true);
    // Record the inquiry for /admin BEFORE handing the visitor to their mail
    // client. `keepalive` is the load-bearing bit: assigning window.location
    // starts a navigation that would otherwise cancel an in-flight fetch.
    // Fire-and-forget on purpose — a failure here must never block sending.
    void fetch("/api/inquiries", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name ?? "",
        email: values.email ?? "",
        company: values.company ?? "",
        service,
        budget,
        message,
      }),
    }).catch(() => {});
    window.location.href = `mailto:${CONTACT_PAGE.email}?subject=${encodeURIComponent(
      "New project inquiry"
    )}&body=${encodeURIComponent(lines.join("\n"))}`;
  };

  /** Clear a field's error as soon as the visitor fixes it. */
  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  return (
    // FLAT #741A14 (opaque, so the page's fixed cycling gradient does not read
    // through here) — the form block holds one steady colour and the only
    // movement behind it is the smoke.
    <div className="relative bg-[#741a14]">
      <Fumes />
      <section className="relative px-[8%] pb-[max(64px,8vw)] pt-[max(64px,8vw)]">
        {/* Note */}
        <Reveal>
          <p className="max-w-[320px] font-sans-luxury text-[16px] font-bold uppercase leading-[1.5] text-[#fff3d3]">
            {CONTACT_PAGE.note}
          </p>
        </Reveal>

        {/* Heading */}
        <Reveal delay={0.05} className="mt-[max(40px,5vw)] text-center">
          <h2 className="font-serif-luxury text-[max(34px,4.17vw)] font-normal leading-normal text-[#fff3d3]">
            {CONTACT_PAGE.formHeading}
          </h2>
          <p className="mt-3 font-sans-luxury text-[max(13px,1.06vw)] text-[#fff3d3]/90">
            {CONTACT_PAGE.formSub}
          </p>
        </Reveal>

        {/* Form — trionn field set: name/email, company/service, budget,
            goals textarea, Send Inquiry. Rows rise in one after another. */}
        <form
          onSubmit={submit}
          // noValidate: our own inline warnings replace the browser's native
          // bubbles, which cannot style and skip the custom pickers entirely
          noValidate
          className="mx-auto mt-[max(36px,4.2vw)] grid w-full max-w-[1088px] grid-cols-1 gap-[18px] md:grid-cols-2 md:gap-6"
        >
          <FormRow index={0}>
            <input
              type="text"
              placeholder={`${CONTACT_PAGE.fields[0].label} *`}
              aria-label={CONTACT_PAGE.fields[0].label}
              aria-invalid={Boolean(errors.name)}
              data-invalid={Boolean(errors.name)}
              value={values.name ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, name: e.target.value }));
                clearError("name");
              }}
              className={`${FIELD_CLS} ${errors.name ? "border-[#ffcf9a]" : ""}`}
            />
            <FieldError msg={errors.name} />
          </FormRow>
          <FormRow index={1}>
            <input
              type="email"
              placeholder={`${CONTACT_PAGE.fields[1].label} *`}
              aria-label={CONTACT_PAGE.fields[1].label}
              aria-invalid={Boolean(errors.email)}
              data-invalid={Boolean(errors.email)}
              value={values.email ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, email: e.target.value }));
                clearError("email");
              }}
              className={`${FIELD_CLS} ${errors.email ? "border-[#ffcf9a]" : ""}`}
            />
            <FieldError msg={errors.email} />
          </FormRow>
          <FormRow index={2}>
            <input
              type="text"
              placeholder={CONTACT_PAGE.fields[2].label}
              aria-label={CONTACT_PAGE.fields[2].label}
              value={values.company ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, company: e.target.value }))}
              className={FIELD_CLS}
            />
          </FormRow>
          <FormRow index={3}>
            <div data-invalid={Boolean(errors.service)}>
              <OptionPicker
                placeholder={`${CONTACT_PAGE.services.placeholder} *`}
                options={CONTACT_PAGE.services.options}
                value={service}
                invalid={Boolean(errors.service)}
                onChange={(v) => {
                  setService(v);
                  clearError("service");
                }}
              />
              <FieldError msg={errors.service} />
            </div>
          </FormRow>
          <FormRow index={4} className="md:col-span-2">
            <div data-invalid={Boolean(errors.budget)}>
              <OptionPicker
                placeholder={`${CONTACT_PAGE.budgets.placeholder} *`}
                options={CONTACT_PAGE.budgets.options}
                value={budget}
                invalid={Boolean(errors.budget)}
                onChange={(v) => {
                  setBudget(v);
                  clearError("budget");
                }}
              />
              <FieldError msg={errors.budget} />
            </div>
          </FormRow>
          <FormRow index={5} className="md:col-span-2">
            <textarea
              rows={5}
              placeholder={`${CONTACT_PAGE.message.label} *`}
              aria-label="Project details"
              aria-invalid={Boolean(errors.message)}
              data-invalid={Boolean(errors.message)}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                clearError("message");
              }}
              className={`${FIELD_CLS} h-auto resize-none py-5 leading-relaxed ${
                errors.message ? "border-[#ffcf9a]" : ""
              }`}
            />
            <FieldError msg={errors.message} />
          </FormRow>
          <FormRow index={6} className="md:col-span-2 flex flex-col items-center gap-3">
            <button
              type="submit"
              className="group flex w-[220px] cursor-pointer flex-col"
            >
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
          </FormRow>
        </form>

        {/* or ——— Book a 30-minute call (in-site slots, admin-managed) */}
        <div className="mx-auto mt-[max(40px,4.5vw)] w-full max-w-[1088px]">
          <Reveal className="flex items-center gap-5">
            <span className="h-px flex-1 bg-[#fff3d3]/30" />
            <span className="font-sans-luxury text-[13px] uppercase tracking-[0.2em] text-[#fff3d3]/70">
              {CONTACT_PAGE.or}
            </span>
            <span className="h-px flex-1 bg-[#fff3d3]/30" />
          </Reveal>
          <Reveal delay={0.08} className="mt-[max(28px,2.6vw)]">
            <BookCall />
            <p className="mt-6 text-center font-sans-luxury text-[12.5px] text-[#fff3d3]/60">
              {CONTACT_PAGE.bookCall.note}
            </p>
          </Reveal>
        </div>
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
    // relative z-20 -mt-[90vh]: slides up over the maroon block's finished
    // cream strip cover — same hand-off KeyFacts uses on the home page
    <section className="relative z-20 -mt-[90vh] bg-[#fff3d3] px-[2%] pb-[max(64px,8vw)] pt-[max(72px,9vw)] text-black">
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
                <div className="px-[2%] pb-10 pl-[calc(2%+48px)]">
                  <p className="max-w-[76ch] font-sans-luxury text-[max(14px,1.06vw)] leading-relaxed text-black/80">
                    {f.a}
                  </p>
                  {f.bullets ? (
                    <ul className="mt-4 flex max-w-[76ch] flex-col gap-2">
                      {f.bullets.map((b) => (
                        <li
                          key={b}
                          className="flex items-start gap-3 font-sans-luxury text-[max(14px,1.06vw)] leading-relaxed text-black/80"
                        >
                          <span aria-hidden="true" className="mt-[0.55em] size-[5px] shrink-0 rounded-full bg-[#741a14]" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {f.after ? (
                    <p className="mt-4 max-w-[76ch] font-sans-luxury text-[max(14px,1.06vw)] leading-relaxed text-black/80">
                      {f.after}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
