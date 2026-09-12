"use client";

import { useEffect, useState } from "react";

import { useDoc } from "./useCms";
import {
  Btn,
  Card,
  Field,
  Input,
  LinesField,
  PageHead,
  SectionLabel,
  Spinner,
  Textarea,
  useToast,
} from "./ui";
import type { Homepage } from "@/lib/admin/cms/types";

/** Hero copy, marquee, and CTA banner. Section content below the fold lives in
    its own module (Portfolio, Testimonials, …), which is why this screen is
    short — it edits the parts that belong to no other collection. */
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
        sub="Hero copy, marquee, and CTA banner. Section content below the fold lives in their own modules."
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
              <Field label="Eyebrow">
                <Input value={draft.hero.eyebrow} onChange={(e) => hero("eyebrow", e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Headline" required>
                <Textarea
                  rows={2}
                  value={draft.hero.headline}
                  onChange={(e) => hero("headline", e.target.value)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Subhead" required>
                <Textarea
                  rows={3}
                  value={draft.hero.subhead}
                  onChange={(e) => hero("subhead", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Primary CTA label">
              <Input
                value={draft.hero.primaryCtaLabel}
                onChange={(e) => hero("primaryCtaLabel", e.target.value)}
              />
            </Field>
            <Field label="Primary CTA href">
              <Input
                value={draft.hero.primaryCtaHref}
                onChange={(e) => hero("primaryCtaHref", e.target.value)}
              />
            </Field>
            <Field label="Secondary CTA label">
              <Input
                value={draft.hero.secondaryCtaLabel}
                onChange={(e) => hero("secondaryCtaLabel", e.target.value)}
              />
            </Field>
            <Field label="Secondary CTA href">
              <Input
                value={draft.hero.secondaryCtaHref}
                onChange={(e) => hero("secondaryCtaHref", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <LinesField
                label="Microcopy chips"
                value={draft.hero.chips}
                onChange={(v) => hero("chips", v)}
              />
            </div>
          </div>
        </Card>

        <Card>
          <SectionLabel>02 Marquee</SectionLabel>
          <LinesField
            label="Items"
            value={draft.marquee.items}
            onChange={(v) => setDraft({ ...draft, marquee: { items: v } })}
          />
        </Card>

        <Card>
          <SectionLabel>03 What we do</SectionLabel>
          <div className="space-y-4">
            <Field label="Heading">
              <Input
                value={draft.whatWeDo.heading}
                onChange={(e) =>
                  setDraft({ ...draft, whatWeDo: { ...draft.whatWeDo, heading: e.target.value } })
                }
              />
            </Field>
            <Field label="Body">
              <Textarea
                rows={3}
                value={draft.whatWeDo.body}
                onChange={(e) =>
                  setDraft({ ...draft, whatWeDo: { ...draft.whatWeDo, body: e.target.value } })
                }
              />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionLabel>10 CTA banner</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Heading">
                <Input
                  value={draft.ctaBanner.heading}
                  onChange={(e) =>
                    setDraft({ ...draft, ctaBanner: { ...draft.ctaBanner, heading: e.target.value } })
                  }
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Body">
                <Textarea
                  rows={2}
                  value={draft.ctaBanner.body}
                  onChange={(e) =>
                    setDraft({ ...draft, ctaBanner: { ...draft.ctaBanner, body: e.target.value } })
                  }
                />
              </Field>
            </div>
            <Field label="Primary CTA label">
              <Input
                value={draft.ctaBanner.primaryCtaLabel}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ctaBanner: { ...draft.ctaBanner, primaryCtaLabel: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Primary CTA href">
              <Input
                value={draft.ctaBanner.primaryCtaHref}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ctaBanner: { ...draft.ctaBanner, primaryCtaHref: e.target.value },
                  })
                }
              />
            </Field>
          </div>
        </Card>
      </div>

      {toast}
    </>
  );
}
