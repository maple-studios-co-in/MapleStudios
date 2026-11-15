import fs from "node:fs";
import {
  Document,
  Paragraph,
  TextRun,
  Header,
  Footer,
  PageNumber,
  ImageRun,
  Packer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
} from "docx";
import type { DraftSnapshot } from "./documents.service.js";
export type ExportDraft = {
  title: string;
  subject: string;
  body: string;
  kind: string;
  revision: number;
  snapshot: DraftSnapshot;
};
const logoPath = new URL(
  "../../../../public/brand/maple-mark.png",
  import.meta.url,
);
const logo = () => {
  try {
    return fs.readFileSync(logoPath);
  } catch {
    return undefined;
  }
};
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
export function renderHtml(d: ExportDraft) {
  const s = d.snapshot,
    c = s.company,
    inv = s.invoice,
    mark = logo();
  const h = escapeHtml;
  const footer = [c.website, c.email, c.phone]
    .filter(Boolean)
    .map(h)
    .join(" · ");
  let financial = "";
  if (inv) {
    financial = `<section><div class="parties"><div><h3>From</h3><strong>${h(c.legalName || c.name)}</strong><p>${h(c.address || "Address not set")}</p><p>GSTIN: ${h(c.gstin || "Not set")}</p></div><div><h3>Bill to</h3><strong>${h(s.client.name)}</strong><p>${h(s.client.billingAddress || "Address not set")}</p><p>GSTIN: ${h(s.client.gstin || "Not provided")}</p></div></div><p>Reference: ${h(inv.reference)}<br>Invoice date: ${h(inv.issueDate)} · Due: ${h(inv.dueDate)}<br>PO: ${h(inv.poNumber || "—")} · Place of supply: ${h(inv.placeOfSupply || "Not set")}</p><table class="lines"><thead><tr>${["Description / SAC", "Qty", "Rate", "Discount", "Tax", "Total"].map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${inv.lines.map((l) => `<tr><td>${h(l.description)}<br><small>${h(l.sac || "SAC not set")}</small></td><td>${h(l.quantityHundredths / 100)}</td><td>${money(l.unitPrice)}</td><td>${money(l.discount)}</td><td>${money(l.cgst + l.sgst + l.igst)}<br><small>${l.taxRateBps / 100}%</small></td><td>${money(l.total)}</td></tr>`).join("")}</tbody></table><div class="totals">${Object.entries(
      {
        Subtotal: inv.totals.subtotal,
        Discount: inv.totals.discount,
        "Taxable value": inv.totals.taxable,
        CGST: inv.totals.cgst,
        SGST: inv.totals.sgst,
        IGST: inv.totals.igst,
        "Total INR": inv.totals.total,
      },
    )
      .map(
        ([label, n]) =>
          `<p><span>${label}</span><strong>${money(n)}</strong></p>`,
      )
      .join(
        "",
      )}</div><h3>Payment instructions</h3><p>${h(c.paymentInstructions || "Payment instructions not set.").replace(/\n/g, "<br>")}</p><p>${h(inv.notes).replace(/\n/g, "<br>")}</p></section>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${h(d.title)} — Draft</title><meta name="referrer" content="no-referrer"><style>@page{size:Letter;margin:18mm}*{box-sizing:border-box}body{font:11pt Arial,sans-serif;color:#171717;margin:0 auto;max-width:780px;padding:24px;line-height:1.5;overflow-wrap:anywhere}.page{width:100%;border-collapse:collapse}.page>thead{display:table-header-group}.page>tfoot{display:table-footer-group}.page>thead td{padding-bottom:20px}.page>tfoot td{padding-top:18px;font-size:9pt;color:#555}.brand{display:flex;gap:16px;align-items:center}.brand img{width:62px;height:auto}.brand strong{font-size:17pt}.brand p{margin:0;font-size:9pt}.draft{color:#741a14;font-weight:bold;letter-spacing:2px;font-size:9pt}h1{font:24pt Georgia,serif;margin:12px 0;color:#000}h3{color:#000;font-size:11pt;margin-top:20px}.body p{white-space:pre-wrap;margin:0 0 12px;orphans:3;widows:3}.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px}.lines{width:100%;border-collapse:collapse;font-size:9pt;margin:18px 0}.lines th{text-align:left;background:#f1ebe2;padding:8px}.lines td{border-bottom:1px solid #ddd;padding:8px;vertical-align:top}.lines th:first-child{width:34%}.lines tr{break-inside:avoid}.totals{max-width:330px;margin-left:auto}.totals p{display:flex;justify-content:space-between;gap:16px;margin:6px 0}@media print{body{max-width:none;padding:0}.parties{break-inside:avoid}.lines thead{display:table-header-group}h1,h3{break-after:avoid}}</style></head><body><table class="page"><thead><tr><td><div class="brand">${mark ? `<img src="data:image/png;base64,${mark.toString("base64")}" alt="Maple Studios logo">` : ""}<div><strong>${h(c.name)}</strong><p>${h(c.address)}</p></div></div></td></tr></thead><tfoot><tr><td>${footer}<br>Draft for review · Revision ${d.revision}</td></tr></tfoot><tbody><tr><td><p class="draft">DRAFT FOR REVIEW</p><h1>${h(d.title)}</h1><p>${h(s.client.name)} · ${h(s.project.title)}<br>${h(s.documentDate)}${s.reference ? ` · ${h(s.reference)}` : ""}</p>${d.subject ? `<p><strong>Subject:</strong> ${h(d.subject)}</p>` : ""}<div class="body">${d.body
    .split(/\n\n+/)
    .map((p) => `<p>${h(p)}</p>`)
    .join("")}</div>${financial}</td></tr></tbody></table></body></html>`;
}
export async function renderDocx(d: ExportDraft) {
  const s = d.snapshot,
    c = s.company,
    mark = logo();
  const p = (text: string) =>
    new Paragraph({ text, spacing: { after: 160 }, widowControl: true });
  const paragraphs: (Paragraph | Table)[] = [
    new Paragraph({ text: "DRAFT FOR REVIEW", spacing: { after: 160 } }),
    new Paragraph({ text: d.title, heading: HeadingLevel.TITLE }),
    p(`${s.client.name} · ${s.project.title}`),
    p(`${s.documentDate}${s.reference ? " · " + s.reference : ""}`),
  ];
  if (d.subject) paragraphs.push(p("Subject: " + d.subject));
  for (const text of d.body.split("\n")) paragraphs.push(p(text));
  const inv = s.invoice;
  if (inv) {
    paragraphs.push(
      new Paragraph({
        text: "Invoice details",
        heading: HeadingLevel.HEADING_1,
      }),
      p(
        `From: ${c.legalName || c.name}\n${c.address || "Address not set"}\nGSTIN: ${c.gstin || "Not set"}`,
      ),
      p(
        `Bill to: ${s.client.name}\n${s.client.billingAddress || "Address not set"}\nGSTIN: ${s.client.gstin || "Not provided"}`,
      ),
      p(
        `Reference: ${inv.reference}\nDate: ${inv.issueDate} · Due: ${inv.dueDate}\nPO: ${inv.poNumber || "—"} · Place of supply: ${inv.placeOfSupply || "Not set"}`,
      ),
    );
    const row = (values: string[], header = false) =>
      new TableRow({
        tableHeader: header,
        cantSplit: true,
        children: values.map(
          (text) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text, bold: header, size: 18 })],
                }),
              ],
              ...(header ? { shading: { fill: "F1EBE2" } } : {}),
            }),
        ),
      });
    paragraphs.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row(
            ["Description / SAC", "Qty", "Rate", "Discount", "Tax", "Total"],
            true,
          ),
          ...inv.lines.map((l) =>
            row([
              l.description + (l.sac ? " / " + l.sac : ""),
              String(l.quantityHundredths / 100),
              money(l.unitPrice),
              money(l.discount),
              `${money(l.cgst + l.sgst + l.igst)} (${l.taxRateBps / 100}%)`,
              money(l.total),
            ]),
          ),
        ],
      }),
    );
    for (const [label, value] of Object.entries({
      Subtotal: inv.totals.subtotal,
      Discount: inv.totals.discount,
      "Taxable value": inv.totals.taxable,
      CGST: inv.totals.cgst,
      SGST: inv.totals.sgst,
      IGST: inv.totals.igst,
      "Total INR": inv.totals.total,
    }))
      paragraphs.push(
        new Paragraph({
          text: `${label}: ${money(value)}`,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 120 },
        }),
      );
    paragraphs.push(
      new Paragraph({
        text: "Payment instructions",
        heading: HeadingLevel.HEADING_1,
      }),
      p(c.paymentInstructions || "Payment instructions not set."),
      p(inv.notes),
    );
  }
  const document = new Document({
    creator: c.name,
    title: d.title,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22, color: "000000" },
          paragraph: { spacing: { line: 276 } },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Georgia", size: 44, color: "000000" },
          paragraph: { spacing: { after: 240 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Arial", size: 26, bold: true, color: "000000" },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: 1650,
              bottom: 1200,
              left: 1000,
              right: 1000,
              header: 450,
              footer: 450,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  ...(mark
                    ? [
                        new ImageRun({
                          type: "png",
                          data: mark,
                          transformation: { width: 48, height: 31 },
                        }),
                      ]
                    : []),
                  new TextRun({
                    text: "  " + c.name,
                    bold: true,
                    size: 28,
                    color: "000000",
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: c.address, size: 18, color: "000000" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: [c.website, c.email, c.phone]
                      .filter(Boolean)
                      .join(" · "),
                    size: 16,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Draft for review · Revision ${d.revision} · Page `,
                    size: 16,
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
                  new TextRun({ text: " of ", size: 16 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 }),
                ],
              }),
            ],
          }),
        },
        children: paragraphs,
      },
    ],
  });
  return Packer.toBuffer(document);
}
