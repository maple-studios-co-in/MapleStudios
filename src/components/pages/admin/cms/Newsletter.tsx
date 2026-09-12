"use client";

import { useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";

import { useCollection } from "./useCms";
import {
  Badge,
  Btn,
  Confirm,
  Field,
  Input,
  Modal,
  PageHead,
  Select,
  Spinner,
  Table,
  Td,
  Tr,
  downloadCsv,
  shortDate,
  statusTone,
  useToast,
} from "./ui";
import { StatCard } from "../AdminShell";
import type { Subscriber } from "@/lib/admin/cms/types";

/** Subscribers and growth signal. */
export default function Newsletter() {
  const { data, loading, error, create, update, remove } = useCollection<Subscriber>("newsletter");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<Subscriber | null>(null);
  const { show, node: toast } = useToast();

  const all = useMemo(() => data ?? [], [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((s) => {
      if (status && s.status !== status) return false;
      return !needle || s.email.toLowerCase().includes(needle);
    });
  }, [all, q, status]);

  const stats = useMemo(() => {
    const active = all.filter((s) => s.status === "active").length;
    const bySource = new Map<string, number>();
    for (const s of all) {
      const k = s.source || "direct";
      bySource.set(k, (bySource.get(k) ?? 0) + 1);
    }
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];
    return { active, total: all.length, top };
  }, [all]);

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;

  return (
    <>
      <PageHead
        title="Newsletter"
        sub="Subscribers and growth signal."
        action={
          <>
            <Btn onClick={() => setAdding(true)}>
              <Plus size={12} /> Add
            </Btn>
            <Btn
              onClick={() =>
                downloadCsv(
                  `maple-subscribers-${new Date().toISOString().slice(0, 10)}.csv`,
                  all.map((s) => ({
                    email: s.email,
                    source: s.source,
                    status: s.status,
                    joined: s.createdAt,
                  }))
                )
              }
              disabled={!all.length}
            >
              <Download size={12} /> Export CSV
            </Btn>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active subscribers" value={stats.active} />
        <StatCard label="Total ever signed up" value={stats.total} />
        <StatCard
          label="Top source"
          value={
            stats.top ? <span className="text-[24px] leading-tight">{stats.top[0]}</span> : "—"
          }
          hint={stats.top ? `${stats.top[1]} sign-up${stats.top[1] === 1 ? "" : "s"}` : undefined}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-full max-w-[340px]">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email…" />
        </div>
        <div className="w-full max-w-[220px]">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "unsubscribed", label: "Unsubscribed" },
            ]}
          />
        </div>
      </div>

      <Table head={["Email", "Source", "Status", "Joined", "Actions"]} empty="No subscribers yet.">
        {rows.map((s) => (
          <Tr key={s.id}>
            <Td>{s.email}</Td>
            <Td className="text-[#8b8178]">{s.source || "direct"}</Td>
            <Td>
              <Badge tone={statusTone(s.status)}>{s.status}</Badge>
            </Td>
            <Td className="text-[#8b8178]">{shortDate(s.createdAt)}</Td>
            <Td className="whitespace-nowrap text-right">
              <div className="flex items-center justify-end gap-1.5">
                <Btn
                  onClick={async () => {
                    const next = s.status === "active" ? "unsubscribed" : "active";
                    await update(s.id, { status: next });
                    show(next === "active" ? "Resubscribed" : "Marked unsubscribed");
                  }}
                >
                  {s.status === "active" ? "Mark unsub" : "Resubscribe"}
                </Btn>
                <button
                  aria-label="Delete subscriber"
                  onClick={() => setConfirming(s)}
                  className="cursor-pointer rounded-full p-1.5 text-[#8b8178] transition-colors hover:bg-[#a3231b]/10 hover:text-[#a3231b]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Td>
          </Tr>
        ))}
      </Table>

      {adding ? (
        <AddSubscriber
          onCancel={() => setAdding(false)}
          onSave={async (email, source) => {
            await create({ email, source, status: "active" });
            show("Subscriber added");
            setAdding(false);
          }}
        />
      ) : null}

      {confirming ? (
        <Confirm
          title="Delete this subscriber?"
          body={`${confirming.email} will be removed from the list permanently. To keep the record but stop sending, use "Mark unsub" instead.`}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            await remove(confirming.id);
            show("Deleted");
            setConfirming(null);
          }}
        />
      ) : null}

      {toast}
    </>
  );
}

function AddSubscriber({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (email: string, source: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("manual");
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <Modal title="Add subscriber" onClose={onCancel}>
      <div className="space-y-4">
        <Field label="Email" required>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Source" hint="where the sign-up came from">
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
      </div>
      {problem ? (
        <p role="alert" className="mt-3 font-sans-luxury text-[12.5px] text-[#a3231b]">
          {problem}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn
          variant="primary"
          onClick={() => {
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
              return setProblem("Enter a valid email address.");
            void onSave(email.trim(), source.trim() || "manual");
          }}
        >
          Add
        </Btn>
      </div>
    </Modal>
  );
}
