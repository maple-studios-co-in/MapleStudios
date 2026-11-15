"use client";
import { useEffect, useState } from "react";
import { useAdmin } from "../AdminShell";
import {
  PageHead,
  Btn,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  Badge,
} from "../cms/ui";
import { api, Company as Profile, Template, labels, message } from "./api";
import { ErrorBox } from "./shared";
const fields = {
  name: "Display name",
  legalName: "Legal name",
  address: "Registered / business address",
  website: "Website",
  email: "Client contact email",
  phone: "Phone",
  gstin: "GSTIN (optional)",
  representative: "Representative name",
  representativeTitle: "Representative title",
  paymentInstructions: "Payment instructions",
};
const placeholders = [
  "company.name",
  "company.legalName",
  "company.address",
  "company.email",
  "company.phone",
  "company.website",
  "company.gstin",
  "company.representative",
  "company.representativeTitle",
  "client.name",
  "client.contactName",
  "client.email",
  "client.address",
  "client.gstin",
  "project.title",
  "project.scope",
  "project.startDate",
  "project.dueDate",
  "project.deliverables",
  "document.date",
  "document.reference",
  "notes",
];
export default function Company() {
  const { account } = useAdmin(),
    owner = account?.role === "owner";
  const [profile, setProfile] = useState<Profile>(),
    [templates, setTemplates] = useState<Template[]>([]),
    [edit, setEdit] = useState<Partial<Template>>(),
    [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    Promise.all([
      api<{ item: Profile }>("/company"),
      api<{ items: Template[] }>("/templates"),
    ])
      .then(([p, t]) => {
        if (alive) {
          setProfile(p.item);
          setTemplates(t.items);
        }
      })
      .catch((e) => {
        if (alive) setError(message(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setProfile(
        (await api<{ item: Profile }>("/company", "PATCH", profile)).item,
      );
      setNotice(
        "Company details saved. Existing drafts retain their saved details.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const r = await api<{ item: Template }>("/templates", "PUT", edit);
      setTemplates((ts) => [...ts.filter((t) => t.id !== r.item.id), r.item]);
      setEdit(undefined);
    } catch (e) {
      setFormError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Company & templates"
        sub="Shared branding and reusable client documents. Only the Owner can change these settings."
      />
      <ErrorBox error={error} />
      {notice && (
        <p role="status" className="mb-4 text-sm text-green-800">
          {notice}
        </p>
      )}
      {profile && (
        <Card>
          <form onSubmit={save} className="space-y-4">
            <h2 className="font-serif-luxury text-2xl">Company details</h2>
            <p className="text-sm">
              Verify the business details before using them in client documents.
              Leave tax and payment information blank until confirmed.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(fields).map(([key, label]) => (
                <Field key={key} label={label}>
                  {["address", "paymentInstructions"].includes(key) ? (
                    <Textarea
                      disabled={!owner}
                      value={profile[key as keyof typeof fields]}
                      onChange={(e) =>
                        setProfile({ ...profile, [key]: e.target.value })
                      }
                    />
                  ) : (
                    <Input
                      disabled={!owner}
                      required={key === "name"}
                      type={
                        key === "email"
                          ? "email"
                          : key === "website"
                            ? "url"
                            : "text"
                      }
                      value={profile[key as keyof typeof fields]}
                      onChange={(e) =>
                        setProfile({ ...profile, [key]: e.target.value })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
            {owner && (
              <Btn type="submit" variant="primary" disabled={busy}>
                Save company details
              </Btn>
            )}
          </form>
        </Card>
      )}
      <div className="my-6 flex items-center justify-between gap-3">
        <h2 className="font-serif-luxury text-2xl">Document templates</h2>
        {owner && (
          <Btn
            onClick={() => {
              setFormError("");
              setEdit({
                name: "",
                kind: "confidentiality",
                subject: "",
                body: "",
                status: "draft",
                revision: 0,
              });
            }}
          >
            New template
          </Btn>
        )}
      </div>
      <p className="mb-4 text-sm">
        Agreement templates remain drafts until the Owner reviews their terms
        and publishes them. Publishing makes a template available to the team;
        it does not sign or send anything.
      </p>
      <div className="space-y-3">
        {templates.map((t) => (
          <Card key={t.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <h3 className="font-serif-luxury text-xl">{t.name}</h3>
              <Badge>
                {t.status} · v{t.revision}
              </Badge>
            </div>
            <p className="my-2 text-sm">{t.kind}</p>
            <Btn
              onClick={() => {
                setFormError("");
                setEdit({
                  id: t.id,
                  revision: t.revision,
                  name: t.name,
                  kind: t.kind,
                  subject: t.subject,
                  body: t.body,
                  status: t.status,
                });
              }}
            >
              {owner ? "Review / edit" : "View template"}
            </Btn>
          </Card>
        ))}
      </div>
      {edit && (
        <Modal
          title="Document template"
          wide
          onClose={() => {
            if (!busy) setEdit(undefined);
          }}
        >
          <form onSubmit={saveTemplate} className="space-y-4">
            <Field label="Template name">
              <Input
                required
                disabled={!owner}
                value={edit.name}
                maxLength={160}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select
                  disabled={!owner}
                  value={edit.kind}
                  options={labels(["onboarding", "update", "confidentiality"])}
                  onChange={(e) => setEdit({ ...edit, kind: e.target.value })}
                />
              </Field>
              <Field label="Availability">
                <Select
                  disabled={!owner}
                  value={edit.status}
                  options={[
                    { value: "draft", label: "Draft — Owner review" },
                    {
                      value: "published",
                      label: "Published — available to team",
                    },
                  ]}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Subject">
              <Input
                disabled={!owner}
                maxLength={300}
                value={edit.subject}
                onChange={(e) => setEdit({ ...edit, subject: e.target.value })}
              />
            </Field>
            <Field label="Template text">
              <Textarea
                required
                disabled={!owner}
                rows={16}
                maxLength={40000}
                value={edit.body}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
              />
            </Field>
            <details className="text-sm">
              <summary className="cursor-pointer">
                Supported placeholders
              </summary>
              <p className="mt-2 break-words leading-7">
                {placeholders.map((s) => `{{${s}}}`).join(" · ")}
              </p>
            </details>
            <ErrorBox error={formError} />
            {owner && (
              <Btn type="submit" disabled={busy} variant="primary">
                {edit.status === "published"
                  ? "Save & publish template"
                  : "Save template draft"}
              </Btn>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
