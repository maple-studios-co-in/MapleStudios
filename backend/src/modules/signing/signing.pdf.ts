import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import { create, type Font } from "fontkit";
import { AppError } from "../../lib/AppError.js";
import type { Signature, SigningSnapshot } from "./signing.model.js";

const fontBytes = readFileSync(createRequire(import.meta.url).resolve("@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"));
const font = create(fontBytes) as Font;
const maroon = "#741A14";
const ink = "#252021";
const maxBytes = 2 * 1024 * 1024;
const maxPages = 48;
// Evidence starts on a fresh page. Its two single-line signatures, fixed
// statements, bounded email and timestamps fit within two pages. Reserve
// 256 KiB for their page streams and any additional embedded font glyphs.
const evidencePages = 2;
const evidenceBytes = 256 * 1024;

export function requirePrintable(...values: string[]) {
  for (const value of values) {
    for (const char of value) {
      if (char !== "\n" && char !== "\t" && !font.hasGlyphForCodePoint(char.codePointAt(0)!))
        throw AppError.badRequest("The agreement or signature has characters this PDF font cannot render. Review the text before signing.");
    }
  }
}

type Evidence = { contentHash: string; client: Signature; owner: Signature };

export async function preflightSigningPdf(snapshot: SigningSnapshot) {
  await renderPdf(snapshot);
}

export function renderSigningPdf(snapshot: SigningSnapshot, contentHash: string, client: Signature, owner: Signature) {
  return renderPdf(snapshot, { contentHash, client, owner });
}

async function renderPdf(
  snapshot: SigningSnapshot,
  evidence?: Evidence,
): Promise<Buffer> {
  const pageLimit = evidence ? maxPages : maxPages - evidencePages;
  const byteLimit = evidence ? maxBytes : maxBytes - evidenceBytes;
  const doc = new PDFDocument({
    size: "A4", autoFirstPage: false, bufferPages: true,
    margins: { top: 79, bottom: 63, left: 55, right: 55 },
    info: { Title: snapshot.title, Author: "Maple Studios", ...(evidence && { CreationDate: evidence.owner.signedAt }) },
  });
  doc.registerFont("Agreement", fontBytes).font("Agreement");
  const buffers: Buffer[] = [];
  let bytes = 0;
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > byteLimit) doc.destroy(AppError.badRequest("The signed PDF exceeds the record size limit."));
      else buffers.push(chunk);
    });
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
  let bodySize = 10.5;
  let bodyColor = ink;
  function text(value: string, size = 10.5, color = ink) {
    bodySize = size;
    bodyColor = color;
    doc.fontSize(size).fillColor(color).text(value, { lineGap: 3 });
  }
  let pages = 0;
  doc.on("pageAdded", () => {
    if (++pages > pageLimit)
      throw AppError.badRequest("The agreement exceeds the signed PDF page limit.");
    const { x, y } = doc;
    doc.rect(55, 42, 8, 8).fill(maroon);
    doc.fontSize(9).fillColor(maroon).text("MAPLE STUDIOS", 71, 39, { lineBreak: false });
    doc.moveTo(55, 61).lineTo(doc.page.width - 55, 61).lineWidth(0.6).stroke("#D7CAC4");
    doc.fontSize(bodySize).fillColor(bodyColor);
    doc.x = x;
    doc.y = y;
  });

  try {
    doc.addPage();
    text(snapshot.title, 23, maroon);
    doc.moveDown(0.8);
    text(snapshot.body);
    doc.moveDown(0.9);
    text("Engagement details", 14, maroon);
    text(snapshot.completion);
    doc.moveDown(0.9);
    text("Record retention", 14, maroon);
    text(snapshot.retention.notice);
    if (snapshot.retention.clientAuditNotice) {
      doc.moveDown(0.6);
      text(snapshot.retention.clientAuditNotice);
    }

    if (evidence) {
      doc.addPage();
      text("Electronic signature evidence", 20, maroon);
      if (snapshot.consent.version) text(`Consent version ${snapshot.consent.version}`, 10);
      doc.moveDown(0.7);
      const writeSignature = (label: string, value: Signature, statement: string, method: string) => {
        text(label, 14, maroon);
        text(`${value.name}\nCapacity: ${value.capacity}${value.place ? `\nPlace: ${value.place}` : ""}\nSigned: ${value.signedAt.toISOString()}\n${method}: ${value.verifiedAt.toISOString()}`);
        text(statement);
        doc.moveDown(0.8);
      };
      writeSignature(`Client: ${snapshot.details.signerEmail}`, evidence.client, snapshot.consent.client, "Email verified");
      writeSignature("Studio owner", evidence.owner, snapshot.consent.owner, "Second factor verified");
      text("Agreement content SHA-256", 10, maroon);
      text(evidence.contentHash, 9);
    }

    for (let n = 0; n < pages; n++) {
      doc.switchToPage(n);
      const bottom = doc.page.height - 38;
      doc.moveTo(55, bottom - 11).lineTo(doc.page.width - 55, bottom - 11).lineWidth(0.6).stroke("#D7CAC4");
      doc.fontSize(8.5).fillColor("#635650");
      doc.text("Private agreement", 55, bottom, { lineBreak: false });
      doc.text(`${n + 1} / ${pages}`, doc.page.width - 102, bottom, { lineBreak: false });
    }
    doc.end();
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error("Could not render signed PDF."));
  }
  return output;
}
