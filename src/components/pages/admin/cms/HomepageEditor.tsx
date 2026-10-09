"use client";

import { useEffect, useState } from "react";

import { useDoc } from "./useCms";
import { Btn, Card, Field, Input, PageHead, SectionLabel, Spinner, Textarea, useToast } from "./ui";
import type { Homepage } from "@/lib/admin/cms/types";

/** The homepage hero — the one part of the homepage that belongs to no other
    module. Every field here overrides Site Copy for that one string; left
    empty, Site Copy supplies it. Only fields the live hero renders are shown:
    the rest of the Homepage document keeps the production console's shape
    but nothing on the site reads it yet, so editing it would change nothing. */
export default function HomepageEditor() {
  const { data, loading, error, save } = useDoc<Homepage>("homepage");
  const [draft, setDraft] = useState<Homepage | null>(null);
  const [saving, setSaving] = useState(false);
  const { show, node: toast } = useToast();

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data));
  }, [data, draft]);

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;
  if (!draft) return <Spinner />;

  const hero = <K extends keyof Homepage["hero"]>(k: K, v: Homepage["hero"][K]) =>
    setDraft({ ...draft, hero: { ...draft.hero, [k]: v } });

  const submit = async () => {
    setSaving(true);
    try {
      await save(draft);
      show("Homepage saved");
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not save.", true);
    }
    setSaving(false);
  };

  return (
    <>
      <PageHead
        title="Homepage"
        sub="Hero copy. Leave a field empty to use Site Copy. Sections below the fold live in their own modules (Portfolio, Testimonials) and in Site Copy."
        action={
          <Btn variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save homepage"}
          </Btn>
        }
      />

      <div className="space-y-4">
        <Card>
          <SectionLabel>01 Hero</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Headline" hint="One line per line break. Empty = Site Copy hero.headlineMain / headlineSub.">
                <Textarea
                  rows={2}
                  value={draft.hero.headline}
                  onChange={(e) => hero("headline", e.target.value)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Subhead" hint="Empty = Site Copy hero.subtitle.">
                <Textarea
                  rows={3}
                  value={draft.hero.subhead}
                  onChange={(e) => hero("subhead", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Primary CTA label" hint="Empty = Site Copy hero.cta.">
              <Input
                value={draft.hero.primaryCtaLabel}
                onChange={(e) => hero("primaryCtaLabel", e.target.value)}
              />
            </Field>
            <Field label="Primary CTA link" hint="/path, #section or https://… — empty scrolls to the contact section.">
              <Input
                value={draft.hero.primaryCtaHref}
                onChange={(e) => hero("primaryCtaHref", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Timer caption" hint="Beside the build timer. Empty = Site Copy hero.badge.sublabel.">
                <Input value={draft.hero.eyebrow} onChange={(e) => hero("eyebrow", e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>

      </div>

      {toast}
    </>
  );
}
