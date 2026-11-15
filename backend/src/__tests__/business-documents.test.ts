import { beforeEach, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { AdminUser } from "../modules/auth/admin.model.js";
import { Employee } from "../modules/team/team.model.js";
import { signAccessToken } from "../middleware/auth.js";
const app = createApp(),
  base = "/api/v1/business";
const identities = {
  owner: "200000000000000000000001",
  admin: "200000000000000000000002",
  member: "200000000000000000000003",
};
const auth = (who: keyof typeof identities = "owner") => ({
  authorization: `Bearer ${signAccessToken({ sub: identities[who], email: `${who}@example.com`, role: who, ver: 1 })}`,
});
beforeEach(async () => {
  for (const who of Object.keys(identities) as (keyof typeof identities)[]) {
    await AdminUser.create({
      _id: identities[who],
      name: who,
      email: `${who}@example.com`,
      role: who,
      passwordHash: "unused",
      tokenVersion: 1,
    });
    await Employee.create({
      name: who,
      email: `${who}@example.com`,
      contractStart: "2026-12-01",
      status: "active",
    });
  }
});
async function setup() {
  const c = await request(app)
    .post(base + "/clients")
    .set(auth())
    .send({
      name: "Acme <script>alert(1)</script>",
      contactName: "Sam",
      email: "sam@example.com",
      billingAddress: "Example address",
    });
  expect(c.status).toBe(201);
  const p = await request(app)
    .post(base + "/projects")
    .set(auth())
    .send({
      clientId: c.body.item.id,
      title: "Website",
      scope: "Design and development",
      startDate: "2026-12-01",
      dueDate: "2026-12-31",
      assigneeIds: [identities.member],
    });
  expect(p.status).toBe(201);
  return { clientId: c.body.item.id, projectId: p.body.item.id };
}
const invoice = {
  reference: "DRAFT-EXAMPLE",
  issueDate: "2026-12-01",
  dueDate: "2026-12-16",
  taxMode: "intra",
  lines: [
    {
      description: "Design",
      sac: "998314",
      quantityHundredths: 150,
      unitPrice: 101,
      discount: 2,
      taxRateBps: 1800,
    },
  ],
};
async function draft(kind = "onboarding", extra: Record<string, unknown> = {}) {
  const ids = await setup();
  const r = await request(app)
    .post(base + "/drafts")
    .set(auth())
    .send({
      projectId: ids.projectId,
      kind,
      notes: "Please share the assets.",
      ...extra,
    });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { ...ids, item: r.body.item };
}
it("protects company settings and templates from non-owners and all drafts from members", async () => {
  expect(
    (
      await request(app)
        .get(base + "/company")
        .set(auth("member"))
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .patch(base + "/company")
        .set(auth("admin"))
        .send({ revision: 0, name: "Other" })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .put(base + "/templates")
        .set(auth("admin"))
        .send({
          name: "NDA",
          kind: "confidentiality",
          body: "Text",
          status: "published",
          revision: 0,
        })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .get(base + "/drafts")
        .set(auth("member"))
    ).status,
  ).toBe(403);
});
it("generates factual onboarding and update drafts with immutable snapshots", async () => {
  const { clientId, projectId, item } = await draft();
  expect(item.subject).toContain("Website");
  expect(item.body).toContain("2026-12-31");
  const company = await request(app)
    .patch(base + "/company")
    .set(auth())
    .send({ revision: 0, name: "Changed company" });
  expect(company.status).toBe(200);
  await request(app)
    .patch(`${base}/clients/${clientId}`)
    .set(auth())
    .send({ revision: 0, name: "Changed client" });
  const saved = await request(app).get(`${base}/drafts/${item.id}`).set(auth());
  expect(saved.body.item.snapshot.client.name).toContain("Acme");
  expect(saved.body.item.snapshot.company.name).toBe("Maple Studios");
  const update = await request(app)
    .post(base + "/drafts")
    .set(auth())
    .send({
      projectId,
      kind: "update",
      periodStart: "2026-12-01",
      periodEnd: "2026-12-07",
      notes: "Awaiting product images",
    });
  expect(update.status).toBe(201);
  expect(update.body.item.body).toContain("Awaiting product images");
  expect(update.body.item.body).not.toContain("All deliverables completed");
});
it("retains edited draft versions and rejects stale edits", async () => {
  const { item } = await draft();
  const edit = await request(app)
    .patch(`${base}/drafts/${item.id}`)
    .set(auth())
    .send({
      revision: 0,
      subject: "Reviewed welcome",
      body: "Reviewed content",
    });
  expect(edit.status).toBe(200);
  expect(
    (
      await request(app)
        .patch(`${base}/drafts/${item.id}`)
        .set(auth())
        .send({ revision: 0, body: "Stale" })
    ).status,
  ).toBe(409);
  const versions = await request(app)
    .get(`${base}/drafts/${item.id}/versions`)
    .set(auth());
  expect(versions.status).toBe(200);
  expect(
    versions.body.items.map((v: { revision: number }) => v.revision),
  ).toEqual([1, 0]);
  expect(versions.body.items[1].body).toBe(item.body);
});
it("calculates fractional quantities and component tax rounding in integer paise", async () => {
  const { item } = await draft("invoice", { invoice });
  expect(item.snapshot.invoice.totals).toEqual({
    subtotal: 152,
    discount: 2,
    taxable: 150,
    cgst: 14,
    sgst: 14,
    igst: 0,
    total: 178,
  });
  expect(item.snapshot.invoice.currency).toBe("INR");
});
it("rejects discounts above price and implicit tax on no-tax invoices", async () => {
  const { projectId } = await setup();
  for (const wrong of [
    { ...invoice, lines: [{ ...invoice.lines[0], discount: 999 }] },
    { ...invoice, taxMode: "none" },
    { ...invoice, dueDate: "2026-11-01" },
    { ...invoice, lines: [{ ...invoice.lines[0], quantityHundredths: 0 }] },
  ])
    expect(
      (
        await request(app)
          .post(base + "/drafts")
          .set(auth())
          .send({ projectId, kind: "invoice", invoice: wrong })
      ).status,
    ).toBe(400);
});
it("uses only published confidentiality templates and reports unresolved fields", async () => {
  const { projectId } = await setup();
  let t = await request(app)
    .put(base + "/templates")
    .set(auth())
    .send({
      revision: 0,
      name: "Private NDA template",
      kind: "confidentiality",
      body: "Agreement between {{company.name}} and {{client.name}} for {{project.title}}. {{company.gstin}}",
      status: "draft",
    });
  expect(t.status).toBe(201);
  const tid = t.body.item.id;
  expect(
    (
      await request(app)
        .post(base + "/drafts")
        .set(auth())
        .send({ projectId, kind: "confidentiality", templateId: tid })
    ).status,
  ).toBe(400);
  t = await request(app)
    .put(base + "/templates")
    .set(auth())
    .send({
      id: tid,
      revision: 0,
      name: "Private NDA template",
      kind: "confidentiality",
      body: t.body.item.body,
      status: "published",
    });
  expect(t.status).toBe(200);
  const made = await request(app)
    .post(base + "/drafts")
    .set(auth())
    .send({ projectId, kind: "confidentiality", templateId: tid });
  expect(made.status).toBe(201);
  expect(made.body.item.missing).toContain("company.gstin");
  expect(
    (
      await request(app)
        .get(`${base}/drafts/${made.body.item.id}/export?format=docx`)
        .set(auth())
    ).status,
  ).toBe(400);
  const edited = await request(app)
    .patch(`${base}/drafts/${made.body.item.id}`)
    .set(auth())
    .send({
      revision: 0,
      body: "Reviewed agreement between Maple Studios and Acme.",
    });
  expect(edited.status).toBe(200);
  expect(edited.body.item.missing).toEqual([]);
});
it("escapes untrusted HTML and exports real Word documents with private caching", async () => {
  const { item } = await draft();
  const html = await request(app)
    .get(`${base}/drafts/${item.id}/export?format=html`)
    .set(auth());
  expect(html.status).toBe(200);
  expect(html.headers["cache-control"]).toContain("no-store");
  expect(html.text).toContain("&lt;script&gt;");
  expect(html.text).not.toContain("<script>alert(1)</script>");
  const doc = await request(app)
    .get(`${base}/drafts/${item.id}/export?format=docx`)
    .set(auth())
    .buffer(true)
    .parse((res, done) => {
      const parts: Buffer[] = [];
      res.on("data", (c) => parts.push(Buffer.from(c)));
      res.on("end", () => done(null, Buffer.concat(parts)));
    });
  expect(doc.status).toBe(200);
  expect(doc.headers["content-type"]).toContain("wordprocessingml");
  expect(doc.body.subarray(0, 2).toString()).toBe("PK");
  expect(
    (
      await request(app)
        .get(`${base}/drafts/${item.id}/export?format=docx`)
        .set(auth("member"))
    ).status,
  ).toBe(403);
});
it("rejects unknown projects and prevents editing snapshot identity", async () => {
  expect(
    (
      await request(app)
        .post(base + "/drafts")
        .set(auth())
        .send({ projectId: "200000000000000000000099", kind: "onboarding" })
    ).status,
  ).toBe(404);
  const { item } = await draft();
  expect(
    (
      await request(app)
        .patch(`${base}/drafts/${item.id}`)
        .set(auth())
        .send({ revision: 0, snapshot: { company: { name: "Forged" } } })
    ).status,
  ).toBe(400);
});
it("regenerates from current facts while preserving the reviewed version and rejects stale regeneration", async () => {
  const {item, projectId} = await draft();
  await request(app).patch(`${base}/projects/${projectId}`).set(auth()).send({revision:0,title:"New project title"});
  const r = await request(app).post(`${base}/drafts/${item.id}/regenerate`).set(auth()).send({revision:0,notes:"New inputs"});
  expect(r.status).toBe(200);
  expect(r.body.item.revision).toBe(1);
  expect(r.body.item.body).toContain("New project title");
  const history = await request(app).get(`${base}/drafts/${item.id}/versions`).set(auth());
  expect(history.body.items[1].snapshot.project.title).toBe("Website");
  expect((await request(app).post(`${base}/drafts/${item.id}/regenerate`).set(auth()).send({revision:0})).status).toBe(409);
});
