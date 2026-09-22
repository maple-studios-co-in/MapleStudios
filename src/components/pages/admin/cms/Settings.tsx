"use client";

import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";

import { useDoc } from "./useCms";
import {
  Btn,
  Card,
  Field,
  Input,
  PageHead,
  SectionLabel,
  Select,
  Spinner,
  shortDate,
  useToast,
} from "./ui";
import type { Invite, Settings as SettingsDoc } from "@/lib/admin/cms/types";

/** Profile, team, and integration keys. */
export default function Settings() {
  const { data, loading, error, save } = useDoc<SettingsDoc>("settings");
  const [draft, setDraft] = useState<SettingsDoc | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor">("editor");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { show, node: toast } = useToast();

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data));
  }, [data, draft]);

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;
  if (!draft) return <Spinner />;

  const persist = async (next: SettingsDoc, message: string) => {
    setDraft(next);
    setSaving(true);
    try {
      await save(next);
      show(message);
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not save.", true);
    }
    setSaving(false);
  };

  const sendInvite = async () => {
    const addr = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return setProblem("Enter a valid email address.");
    if (draft.invites.some((i) => i.email.toLowerCase() === addr.toLowerCase()))
      return setProblem("That address already has an outstanding invitation.");
    setProblem(null);

    const invite: Invite = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      email: addr,
      role,
      sentAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
    };
    setEmail("");
    await persist({ ...draft, invites: [invite, ...draft.invites] }, "Invitation recorded");
  };

  return (
    <>
      <PageHead title="Settings" sub="Profile, team, and integration keys." />

      <div className="max-w-[760px] space-y-4">
        <Card>
          <SectionLabel>Profile</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={draft.profile.name}
                onChange={(e) => setDraft({ ...draft, profile: { ...draft.profile, name: e.target.value } })}
              />
            </Field>
            <Field label="Email">
              <Input
                value={draft.profile.email}
                onChange={(e) => setDraft({ ...draft, profile: { ...draft.profile, email: e.target.value } })}
              />
            </Field>
            <Field label="Role">
              <Input value={draft.profile.role} readOnly className="opacity-70" />
            </Field>
            <Field label="Member since">
              <Input value={draft.profile.memberSince} readOnly className="opacity-70" />
            </Field>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="font-sans-luxury text-[11.5px] text-[#a2988b]">
              Sign-in uses the shared admin key held in <code>MAPLE_ADMIN_KEY</code>; change it in the
              hosting environment.
            </p>
            <Btn variant="primary" onClick={() => persist(draft, "Profile saved")} disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Btn>
          </div>
        </Card>

        <Card>
          <SectionLabel>Invite a teammate</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
            <Field label="Email" required>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@maplestudios.co.in" />
            </Field>
            <Field label="Role" required>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "editor")}
                options={[
                  { value: "editor", label: "Editor" },
                  { value: "admin", label: "Admin" },
                ]}
              />
            </Field>
            <div className="flex items-end pb-[2px]">
              <Btn variant="primary" onClick={sendInvite}>
                <UserPlus size={12} /> Send invite
              </Btn>
            </div>
          </div>
          {problem ? (
            <p role="alert" className="mt-2 font-sans-luxury text-[12.5px] text-[#a3231b]">
              {problem}
            </p>
          ) : null}
          <p className="mt-2 font-sans-luxury text-[11.5px] text-[#a2988b]">
            Recorded locally with a 24-hour expiry. Delivering the one-time signup link needs a mail
            provider, which this deployment does not have configured yet.
          </p>
        </Card>

        <Card>
          <SectionLabel>Outstanding invitations</SectionLabel>
          {draft.invites.length === 0 ? (
            <p className="py-6 text-center font-sans-luxury text-[13px] text-[#a2988b]">
              No invitations yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#d8c3a5]/40">
              {draft.invites.map((i) => {
                const expired = new Date(i.expiresAt).getTime() < Date.now();
                return (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-sans-luxury text-[13px] text-[#11100e]">
                        {i.email}
                      </span>
                      <span className="block font-sans-luxury text-[11px] text-[#8b8178]">
                        {i.role} · sent {shortDate(i.sentAt)} ·{" "}
                        {expired ? "expired" : `expires ${shortDate(i.expiresAt)}`}
                      </span>
                    </span>
                    <button
                      aria-label="Revoke invitation"
                      onClick={() =>
                        persist(
                          { ...draft, invites: draft.invites.filter((x) => x.id !== i.id) },
                          "Invitation revoked"
                        )
                      }
                      className="cursor-pointer rounded-full p-1.5 text-[#8b8178] hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <SectionLabel>Integration keys (read-only)</SectionLabel>
          <p className="font-sans-luxury text-[12.5px] leading-[1.6] text-[#6b6259]">
            Keys are configured via environment variables on the server. They are never exposed to the
            admin client.
          </p>
          <ul className="mt-3 space-y-1.5">
            {[
              ["MAPLE_ADMIN_KEY", "gates every /api/admin route"],
              ["Content store", "JSON files under /data/cms (gitignored)"],
              ["Media store", "local files under /data/cms/files"],
            ].map(([k, v]) => (
              <li key={k} className="font-sans-luxury text-[12.5px] text-[#11100e]">
                <strong className="font-bold">{k}</strong>{" "}
                <span className="text-[#8b8178]">— {v}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {toast}
    </>
  );
}
