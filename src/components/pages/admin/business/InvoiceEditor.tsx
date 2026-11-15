"use client";
import { useEffect, useState } from "react";
import { Btn, Field, Input, Select, Textarea } from "../cms/ui";
import { Invoice, today } from "./api";
export const newInvoice = (): Invoice => ({
  reference: "",
  issueDate: today(),
  dueDate: today(),
  poNumber: "",
  placeOfSupply: "",
  taxMode: "none",
  notes: "",
  lines: [
    {
      description: "",
      sac: "",
      quantityHundredths: 100,
      unitPrice: 0,
      discount: 0,
      taxRateBps: 0,
    },
  ],
});
// Decimal input is converted to fixed-point integers at the boundary.
const scaled = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole || 0) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
};
function Decimal({
  value,
  onChange,
  min = "0",
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: string;
  label: string;
}) {
  const [text, setText] = useState((value / 100).toFixed(2));
  useEffect(() => setText((value / 100).toFixed(2)), [value]);
  return (
    <Input
      aria-label={label}
      type="number"
      required
      min={min}
      step="0.01"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => onChange(scaled(e.target.value))}
    />
  );
}
export default function InvoiceEditor({
  value: i,
  onChange,
}: {
  value: Invoice;
  onChange: (i: Invoice) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Amounts in INR. Tax treatment is entered explicitly; confirm it before
        sharing this draft.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["reference", "Draft reference"],
            ["issueDate", "Invoice date"],
            ["dueDate", "Payment due"],
            ["poNumber", "Purchase order (optional)"],
            ["placeOfSupply", "Place of supply"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <Input
              required={["reference", "issueDate", "dueDate"].includes(key)}
              type={key.endsWith("Date") ? "date" : "text"}
              value={i[key]}
              onChange={(e) => onChange({ ...i, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Field label="Tax mode">
          <Select
            value={i.taxMode}
            onChange={(e) =>
              onChange({
                ...i,
                taxMode: e.target.value,
                lines: i.lines.map((l) => ({
                  ...l,
                  taxRateBps: e.target.value === "none" ? 0 : l.taxRateBps,
                })),
              })
            }
            options={[
              { value: "none", label: "No tax" },
              { value: "intra", label: "CGST + SGST" },
              { value: "inter", label: "IGST" },
            ]}
          />
        </Field>
      </div>
      {i.lines.map((l, index) => (
        <fieldset
          key={index}
          className="space-y-3 rounded-lg border border-[#d8c3a5] p-3"
        >
          <legend>Item {index + 1}</legend>
          <Field label="Description">
            <Textarea
              required
              maxLength={1000}
              value={l.description}
              onChange={(e) =>
                onChange({
                  ...i,
                  lines: i.lines.map((x, n) =>
                    n === index ? { ...x, description: e.target.value } : x,
                  ),
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="SAC (optional)">
              <Input
                value={l.sac}
                maxLength={8}
                onChange={(e) =>
                  onChange({
                    ...i,
                    lines: i.lines.map((x, n) =>
                      n === index ? { ...x, sac: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
            {(
              [
                ["quantityHundredths", "Quantity"],
                ["unitPrice", "Unit price ₹"],
                ["discount", "Line discount ₹"],
                ["taxRateBps", "Tax rate %"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <Decimal
                  key={`${index}-${k}-${i.taxMode}`}
                  label={label}
                  min={k === "quantityHundredths" ? "0.01" : "0"}
                  value={l[k]}
                  onChange={(v) =>
                    onChange({
                      ...i,
                      lines: i.lines.map((x, n) =>
                        n === index ? { ...x, [k]: v } : x,
                      ),
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <Btn
            type="button"
            disabled={i.lines.length === 1}
            onClick={() =>
              onChange({ ...i, lines: i.lines.filter((_, n) => n !== index) })
            }
          >
            Remove item
          </Btn>
        </fieldset>
      ))}
      <Btn
        type="button"
        disabled={i.lines.length >= 100}
        onClick={() =>
          onChange({
            ...i,
            lines: [
              ...i.lines,
              {
                description: "",
                sac: "",
                quantityHundredths: 100,
                unitPrice: 0,
                discount: 0,
                taxRateBps: 0,
              },
            ],
          })
        }
      >
        Add item
      </Btn>
      <Field label="Invoice notes">
        <Textarea
          value={i.notes}
          onChange={(e) => onChange({ ...i, notes: e.target.value })}
        />
      </Field>
      {i.totals && (
        <p className="text-sm">
          Last saved total: ₹
          {(i.totals.total / 100).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
          })}
          . Save to recalculate after edits.
        </p>
      )}
    </div>
  );
}
