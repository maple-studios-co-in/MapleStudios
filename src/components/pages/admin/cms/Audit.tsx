"use client";

import { useMemo, useState } from "react";

import { useCollection } from "./useCms";
import { Badge, PageHead, Select, Spinner, Table, Td, Tr, relTime } from "./ui";
import { COLLECTIONS, type AuditEntry } from "@/lib/admin/cms/types";

const ACTIONS = ["create", "update", "delete", "publish", "unpublish", "reorder", "restore", "login"];

/** Read-only trail of who did what across the CMS. */
export default function Audit() {
  const { data, loading, error } = useCollection<AuditEntry>("audit");
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (e) => (!resource || e.resource === resource) && (!action || e.action === action)
      ),
    [data, resource, action]
  );

  if (loading) return <Spinner />;
  if (error) return <p className="font-sans-luxury text-[13px] text-[#a3231b]">{error}</p>;

  return (
    <>
      <PageHead
        title="Audit log"
        sub="A read-only trail of who did what across the CMS — creates, edits, deletes, and more. Filter by resource or action."
        action={
          <>
            <div className="w-[180px]">
              <Select
                value={resource}
                onChange={(e) => setResource(e.target.value)}
                options={[
                  { value: "", label: "All resources" },
                  ...[...COLLECTIONS, "homepage", "site-copy", "settings"].map((c) => ({
                    value: c,
                    label: c,
                  })),
                ]}
              />
            </div>
            <div className="w-[160px]">
              <Select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                options={[
                  { value: "", label: "All actions" },
                  ...ACTIONS.map((a) => ({ value: a, label: a })),
                ]}
              />
            </div>
          </>
        }
      />

      <Table head={["When", "Who", "Action", "Resource", "Summary"]} empty="No audit entries.">
        {rows.map((e) => (
          <Tr key={e.id}>
            <Td className="whitespace-nowrap text-[#8b8178]" >
              <span title={new Date(e.createdAt).toLocaleString()}>{relTime(e.createdAt)}</span>
            </Td>
            <Td>{e.who}</Td>
            <Td>
              <Badge tone={e.action === "delete" ? "archived" : e.action === "publish" ? "live" : "neutral"}>
                {e.action}
              </Badge>
            </Td>
            <Td className="text-[#8b8178]">{e.resource}</Td>
            <Td>{e.summary}</Td>
          </Tr>
        ))}
      </Table>
    </>
  );
}
