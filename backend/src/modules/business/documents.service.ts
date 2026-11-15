import type { Request } from "express";
import { AppError } from "../../lib/AppError.js";
import { Client, Deliverable } from "./business.model.js";
import { BusinessCompany, BusinessTemplate } from "./documents.model.js";
import {
  companyInput,
  defaults,
  type CompanyProfile,
  type DraftInput,
} from "./documents.schema.js";
import { projectFor } from "./business.access.js";
import { calculateInvoice, type CalculatedInvoice } from "./invoice.js";
export type DraftSnapshot = {
  company: CompanyProfile;
  companyRevision: number;
  client: {
    id: string;
    name: string;
    contactName: string;
    email: string;
    billingAddress: string;
    gstin: string;
  };
  project: {
    id: string;
    title: string;
    scope: string;
    startDate: string;
    dueDate: string;
    revision: number;
  };
  documentDate: string;
  reference: string;
  templateId?: string;
  templateRevision?: number;
  invoice?: CalculatedInvoice;
};
export async function companyProfile() {
  const row = await BusinessCompany.findById("company");
  return {
    profile: companyInput.parse(row?.profile || defaults),
    revision: row?.revision || 0,
  };
}
export const unresolved = (...values: string[]) => [
  ...new Set(
    values.flatMap((v) =>
      [...v.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!),
    ),
  ),
];
export function fillTemplate(value: string, fields: Record<string, string>) {
  return value.replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (match: string, key: string) =>
      fields[key]?.trim() ? fields[key]! : match,
  );
}
export async function generateDraft(req: Request, input: DraftInput) {
  const p = await projectFor(req, input.projectId);
  const client = await Client.findById(p.clientId);
  if (!client) throw AppError.notFound("Client no longer exists.");
  const { profile, revision } = await companyProfile();
  const date =
    input.documentDate ||
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const snapshot: DraftSnapshot = {
    company: profile,
    companyRevision: revision,
    client: {
      id: String(client._id),
      name: client.name,
      contactName: client.contactName,
      email: client.email,
      billingAddress: client.billingAddress,
      gstin: client.gstin,
    },
    project: {
      id: String(p._id),
      title: p.title,
      scope: p.scope,
      startDate: p.startDate,
      dueDate: p.dueDate,
      revision: p.revision,
    },
    documentDate: date,
    reference: input.reference,
  };
  const deliverables = await Deliverable.find({
    projectId: String(p._id),
  }).sort({ dueDate: 1, _id: 1 });
  const lines =
    deliverables
      .map((d) => `- ${d.title}: ${d.status}; due ${d.dueDate}`)
      .join("\n") || "No deliverables recorded yet.";
  const contact = client.contactName || client.name;
  let title = "",
    subject = "",
    body = "";
  if (input.kind === "onboarding") {
    title = "Client onboarding";
    subject = `Getting started — ${p.title}`;
    body = `Hi ${contact},\n\nWelcome to ${profile.name}. Here is the starting plan for ${p.title}.\n\nScope\n${p.scope || "Scope to be confirmed."}\n\nSchedule\nStart: ${p.startDate}\nTarget completion: ${p.dueDate}\n\nDeliverables\n${lines}\n\nInputs and next steps\n${input.notes || "Please confirm the primary contact and share the assets/access needed for the agreed scope."}\n\n${profile.representative || profile.name}\n${profile.email || profile.website}`;
  }
  if (input.kind === "update") {
    if (
      !input.periodStart ||
      !input.periodEnd ||
      input.periodStart > input.periodEnd
    )
      throw AppError.badRequest("Choose a valid reporting period.");
    title = "Project update";
    subject = `${p.title} — update ${input.periodStart} to ${input.periodEnd}`;
    const changed = deliverables.filter(
      (d) =>
        d.updatedAt &&
        new Date(d.updatedAt).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        }) >= input.periodStart! &&
        new Date(d.updatedAt).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        }) <= input.periodEnd!,
    );
    body = `Hi ${contact},\n\nHere is the update for ${p.title}, covering ${input.periodStart} to ${input.periodEnd}.\n\nWork updated during this period\n${changed.map((d) => `- ${d.title}: ${d.status}`).join("\n") || "No deliverable updates recorded for this period."}\n\nCurrent plan and due dates\n${lines}\n\nNotes, blockers and decisions\n${input.notes || "Add the team's notes and any decisions needed before sharing."}\n\n${profile.representative || profile.name}`;
  }
  if (input.kind === "invoice") {
    if (!input.invoice) throw AppError.badRequest("Add invoice line items.");
    snapshot.invoice = calculateInvoice(input.invoice);
    snapshot.reference = snapshot.invoice.reference;
    title = "Invoice draft";
    subject = `Invoice draft — ${p.title}`;
    body =
      input.notes || "Please review the line items and payment details below.";
  }
  if (input.kind === "confidentiality") {
    title = "Data and confidentiality agreement";
    subject = `Confidentiality agreement draft — ${p.title}`;
    if (!input.templateId)
      throw AppError.badRequest("Choose a published confidentiality template.");
  }
  if (input.templateId) {
    const template = await BusinessTemplate.findOne({
      _id: input.templateId,
      status: "published",
      kind: input.kind,
    });
    if (!template)
      throw AppError.badRequest(
        "Choose a published template of the same document type.",
      );
    const fields: Record<string, string> = {
      "company.name": profile.name,
      "company.legalName": profile.legalName || profile.name,
      "company.address": profile.address,
      "company.email": profile.email,
      "company.phone": profile.phone,
      "company.website": profile.website,
      "company.gstin": profile.gstin,
      "company.representative": profile.representative,
      "company.representativeTitle": profile.representativeTitle,
      "client.name": client.name,
      "client.contactName": client.contactName,
      "client.email": client.email,
      "client.address": client.billingAddress,
      "client.gstin": client.gstin,
      "project.title": p.title,
      "project.scope": p.scope,
      "project.startDate": p.startDate,
      "project.dueDate": p.dueDate,
      "project.deliverables": lines,
      "document.date": date,
      "document.reference": input.reference,
      notes: input.notes,
    };
    body = fillTemplate(template.body, fields);
    if (template.subject) subject = fillTemplate(template.subject, fields);
    snapshot.templateId = String(template._id);
    snapshot.templateRevision = template.revision;
  }
  return {
    projectId: String(p._id),
    clientId: String(client._id),
    kind: input.kind,
    title,
    subject,
    body,
    snapshot,
    missing: unresolved(body, subject),
    createdBy: req.admin!.email,
    updatedBy: req.admin!.email,
  };
}
