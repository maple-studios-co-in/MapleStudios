import { teamRequest } from "../team/api";
export const api = <T>(path: string, method = "GET", body?: unknown) =>
  teamRequest<T>(`/business${path}`, method, body);
export type Person = { id: string; name: string; email?: string };
export type Client = {
  id: string;
  revision: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  billingAddress: string;
  gstin: string;
  notes: string;
  status: string;
};
export type Project = {
  id: string;
  revision: number;
  clientId: string;
  clientName: string;
  title: string;
  scope: string;
  startDate: string;
  dueDate: string;
  status: string;
  assigneeIds: string[];
};
export type Event = {
  action: string;
  actor: string;
  at: string;
  submissionVersion?: number;
  title?: string;
  description?: string;
  submissionReference?: string;
  note?: string;
  approverName?: string;
  decisionDate?: string;
  evidenceReference?: string;
};
export type Deliverable = {
  id: string;
  revision: number;
  title: string;
  description: string;
  dueDate: string;
  assigneeId: string;
  status: string;
  submissionReference: string;
  note: string;
  submissionVersion: number;
  history: Event[];
  currentApproval: Event | null;
};
export type Meta = { page: number; pages: number; total: number };
export type List<T> = { items: T[]; meta: Meta };
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please retry.";
export const states = ["planned", "active", "on-hold", "completed", "archived"];
export const labels = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll("-", " ") }));
// Pickers fetch every page, so records beyond the first page remain selectable.
export async function all<T>(path: string): Promise<T[]> {
  let page = 1;
  const items: T[] = [];
  while (true) {
    const r = await api<List<T>>(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page}`,
    );
    items.push(...r.items);
    if (page >= r.meta.pages) return items;
    page++;
  }
}
export type Company = {
  revision: number;
  name: string;
  legalName: string;
  address: string;
  website: string;
  email: string;
  phone: string;
  gstin: string;
  representative: string;
  representativeTitle: string;
  paymentInstructions: string;
};
export type Template = {
  id: string;
  revision: number;
  name: string;
  kind: string;
  subject: string;
  body: string;
  status: string;
};
export type InvoiceLine = {
  description: string;
  sac: string;
  quantityHundredths: number;
  unitPrice: number;
  discount: number;
  taxRateBps: number;
};
export type Invoice = {
  reference: string;
  issueDate: string;
  dueDate: string;
  poNumber: string;
  placeOfSupply: string;
  taxMode: string;
  notes: string;
  lines: InvoiceLine[];
  totals?: Record<string, number>;
};
export type Draft = {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  subject: string;
  body: string;
  revision: number;
  missing: string[];
  updatedBy: string;
  updatedAt: string;
  snapshot: {
    company: Company;
    client: Client;
    project: Project;
    reference: string;
    documentDate: string;
    templateId?: string;
    invoice?: Invoice;
  };
};
export const cleanInvoice = (i: Invoice) => ({
  reference: i.reference,
  issueDate: i.issueDate,
  dueDate: i.dueDate,
  poNumber: i.poNumber,
  placeOfSupply: i.placeOfSupply,
  taxMode: i.taxMode,
  notes: i.notes,
  lines: i.lines.map((l) => ({
    description: l.description,
    sac: l.sac,
    quantityHundredths: l.quantityHundredths,
    unitPrice: l.unitPrice,
    discount: l.discount,
    taxRateBps: l.taxRateBps,
  })),
});
