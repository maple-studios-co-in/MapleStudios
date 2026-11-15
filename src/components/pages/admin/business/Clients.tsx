"use client";
import { useState } from "react";
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
import { api, Client, labels, message } from "./api";
import { ErrorBox, Filters, Pager, useList } from "./shared";
const blank = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  billingAddress: "",
  gstin: "",
  notes: "",
  status: "active",
};
export default function Clients() {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Client | null>(),
    [form, setForm] = useState(blank),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const list = useList<Client>(
    `/clients?q=${encodeURIComponent(q)}&status=${status}&page=${page}`,
  );
  function open(c: Client | null) {
    setEdit(c);
    setForm(
      c
        ? {
            name: c.name,
            contactName: c.contactName,
            email: c.email,
            phone: c.phone,
            billingAddress: c.billingAddress,
            gstin: c.gstin,
            notes: c.notes,
            status: c.status,
          }
        : blank,
    );
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        edit ? `/clients/${edit.id}` : "/clients",
        edit ? "PATCH" : "POST",
        { ...form, ...(edit ? { revision: edit.revision } : {}) },
      );
      setEdit(undefined);
      list.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Clients"
        sub="Contacts, billing details and the context behind each relationship."
        action={
          <Btn variant="primary" onClick={() => open(null)}>
            Add client
          </Btn>
        }
      />
      <Filters
        q={q}
        setQ={(s) => {
          setQ(s);
          setPage(1);
        }}
        status={status}
        setStatus={(s) => {
          setStatus(s);
          setPage(1);
        }}
        options={labels(["active", "archived"])}
      />
      <ErrorBox error={list.error} />
      <div className="grid gap-4 md:grid-cols-2">
        {list.data?.items.map((c) => (
          <Card key={c.id}>
            <div className="flex justify-between gap-3">
              <h2 className="font-serif-luxury text-xl break-words">
                {c.name}
              </h2>
              <Badge>{c.status}</Badge>
            </div>
            <p className="my-3 text-sm">
              {c.contactName || "Contact not set"}
              <br />
              {c.email || "Email not set"}
            </p>
            <Btn onClick={() => open(c)}>Edit details</Btn>
          </Card>
        ))}
      </div>
      {list.data?.items.length === 0 && (
        <Card>
          No clients found. Add your first client to create a project.
        </Card>
      )}
      <Pager meta={list.data?.meta} page={page} setPage={setPage} />
      {edit !== undefined && (
        <Modal
          title={edit ? "Edit client" : "New client"}
          onClose={() => {
            if (!busy) setEdit(undefined);
          }}
        >
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["name", "Company / client name"],
                  ["contactName", "Contact name"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["gstin", "GSTIN (optional)"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    required={key === "name"}
                    type={key === "email" ? "email" : "text"}
                    value={form[key]}
                    maxLength={key === "gstin" ? 15 : 160}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
              <Field label="Status">
                <Select
                  value={form.status}
                  options={labels(["active", "archived"])}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Billing address">
              <Textarea
                value={form.billingAddress}
                maxLength={1500}
                onChange={(e) =>
                  setForm({ ...form, billingAddress: e.target.value })
                }
              />
            </Field>
            <Field label="Private client notes">
              <Textarea
                value={form.notes}
                maxLength={5000}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <ErrorBox error={error} />
            <Btn variant="primary" disabled={busy} type="submit">
              {busy ? "Saving…" : "Save client"}
            </Btn>
          </form>
        </Modal>
      )}
    </>
  );
}
