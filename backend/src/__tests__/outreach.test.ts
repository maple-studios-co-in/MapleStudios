import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { signAccessToken } from "../middleware/auth.js";
import { Lead, type ILead } from "../modules/leads/lead.model.js";
import { EmailTemplate } from "../modules/templates/template.model.js";
import { OutreachTarget } from "../modules/outreach/outreach.model.js";

const app = createApp();
const auth = {
  authorization: `Bearer ${signAccessToken({ sub: "test-admin", email: "owner@maplestudios.co.in", role: "owner", ver: 1 })}`,
};
const api = "/api/v1/admin/outreach";

function lead(overrides: Partial<ILead> = {}) {
  return Lead.create({
    firstName: "Asha",
    lastName: "Rao",
    email: "asha@example.com",
    company: "Rao Interiors",
    role: "Founder",
    stage: "contacted",
    ...overrides,
  });
}

async function create(body: Record<string, unknown>) {
  const res = await request(app).post(api).set(auth).send(body);
  expect(res.status).toBe(201);
  return res.body.item as { id: string; [k: string]: unknown };
}

const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`;

describe("outreach: auth", () => {
  it("requires auth", async () => {
    expect((await request(app).get(api)).status).toBe(401);
    expect((await request(app).get(`${api}/due`)).status).toBe(401);
    expect((await request(app).post(api).send({ name: "X", linkedinUrl: profile("x") })).status).toBe(401);
  });
});

describe("outreach: targets", () => {
  it("creates an inline target with an opening history entry and a normalised URL", async () => {
    const item = await create({ name: "Ravi Kumar", company: "Kumar Designs", linkedinUrl: "https://www.linkedin.com/in/ravi-kumar/?utm_source=share" });
    expect(item).toMatchObject({
      name: "Ravi Kumar",
      company: "Kumar Designs",
      role: "",
      leadId: null,
      stage: "identified",
      linkedinUrl: "https://www.linkedin.com/in/ravi-kumar",
      lastActionAt: null,
      nextActionAt: null,
      notes: [],
    });
    expect(item.history).toMatchObject([{ stage: "identified", note: "" }]);
  });

  it("creates a target from a lead, copying its name, company and role", async () => {
    const l = await lead();
    const item = await create({ leadId: String(l._id), linkedinUrl: profile("asha-rao") });
    expect(item).toMatchObject({ leadId: String(l._id), name: "Asha Rao", company: "Rao Interiors", role: "Founder" });
    // Inline fields win over the lead's.
    const l2 = await lead({ email: "b@example.com" });
    const other = await create({ leadId: String(l2._id), name: "A. Rao", linkedinUrl: profile("a-rao") });
    expect(other.name).toBe("A. Rao");
  });

  it("rejects duplicates, unknown leads and bad input", async () => {
    const l = await lead();
    await create({ leadId: String(l._id), linkedinUrl: profile("asha-rao") });

    const sameProfile = await request(app).post(api).set(auth).send({ name: "Someone", linkedinUrl: `${profile("asha-rao")}/` });
    expect(sameProfile.status).toBe(409);
    expect(sameProfile.body.error).toMatch(/already in outreach/);

    const sameLead = await request(app).post(api).set(auth).send({ leadId: String(l._id), linkedinUrl: profile("asha-rao-2") });
    expect(sameLead.status).toBe(409);

    const ghost = await request(app).post(api).set(auth).send({ leadId: "0123456789abcdef01234567", linkedinUrl: profile("ghost") });
    expect(ghost.status).toBe(404);

    const notLinkedIn = await request(app).post(api).set(auth).send({ name: "X", linkedinUrl: "https://example.com/in/x" });
    expect(notLinkedIn.status).toBe(400);
    expect(notLinkedIn.body.details[0].field).toBe("linkedinUrl");

    const nameless = await request(app).post(api).set(auth).send({ linkedinUrl: profile("nobody") });
    expect(nameless.status).toBe(400);
    expect(nameless.body.details[0].field).toBe("name");
  });

  it("lists with stage filter, partial search and paging", async () => {
    await create({ name: "Asha Rao", company: "Rao Interiors", linkedinUrl: profile("asha") });
    await create({ name: "Ravi Kumar", company: "Kumar Designs", linkedinUrl: profile("ravi"), stage: "connected" });
    await create({ name: "Meera Shah", company: "Rao & Sons", linkedinUrl: profile("meera"), stage: "connected" });

    const all = await request(app).get(api).set(auth);
    expect(all.status).toBe(200);
    expect(all.body.meta).toEqual({ total: 3, page: 1, limit: 50, pages: 1 });

    const connected = await request(app).get(`${api}?stage=connected`).set(auth);
    expect(connected.body.items.map((t: { name: string }) => t.name).sort()).toEqual(["Meera Shah", "Ravi Kumar"]);

    const search = await request(app).get(`${api}?q=rao`).set(auth);
    expect(search.body.items.map((t: { name: string }) => t.name).sort()).toEqual(["Asha Rao", "Meera Shah"]);

    const paged = await request(app).get(`${api}?limit=1&page=2`).set(auth);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.meta).toEqual({ total: 3, page: 2, limit: 1, pages: 3 });
  });

  it("reads, updates and deletes a target", async () => {
    const item = await create({ name: "Ravi Kumar", linkedinUrl: profile("ravi") });
    expect((await request(app).get(`${api}/${item.id}`).set(auth)).body.item.id).toBe(item.id);

    const at = new Date(Date.now() + 86_400_000).toISOString();
    const patched = await request(app).patch(`${api}/${item.id}`).set(auth).send({ company: "Kumar Designs", nextActionAt: at });
    expect(patched.status).toBe(200);
    expect(patched.body.item).toMatchObject({ company: "Kumar Designs", nextActionAt: at, stage: "identified" });

    const empty = await request(app).patch(`${api}/${item.id}`).set(auth).send({});
    expect(empty.status).toBe(400);

    expect((await request(app).delete(`${api}/${item.id}`).set(auth)).body).toEqual({ ok: true });
    expect((await request(app).get(`${api}/${item.id}`).set(auth)).status).toBe(404);
    expect((await request(app).get(`${api}/0123456789abcdef01234567`).set(auth)).status).toBe(404);
  });

  it("appends a note signed by the admin", async () => {
    const item = await create({ name: "Ravi Kumar", linkedinUrl: profile("ravi") });
    const res = await request(app).post(`${api}/${item.id}/notes`).set(auth).send({ text: "Met at the Jaipur expo." });
    expect(res.status).toBe(200);
    expect(res.body.item.notes).toMatchObject([{ by: "owner@maplestudios.co.in", text: "Met at the Jaipur expo." }]);
  });
});

describe("outreach: advance", () => {
  it("appends history, stamps lastActionAt and sets or clears nextActionAt", async () => {
    const item = await create({ name: "Ravi Kumar", linkedinUrl: profile("ravi") });
    const next = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const res = await request(app)
      .post(`${api}/${item.id}/advance`)
      .set(auth)
      .send({ stage: "connection_sent", note: "Sent with a short intro.", nextActionAt: next });
    expect(res.status).toBe(200);
    expect(res.body.item.stage).toBe("connection_sent");
    expect(res.body.item.nextActionAt).toBe(next);
    expect(typeof res.body.item.lastActionAt).toBe("string");
    expect(res.body.item.history).toMatchObject([
      { stage: "identified" },
      { stage: "connection_sent", note: "Sent with a short intro." },
    ]);

    // Advancing without a next action clears the old one: nothing stale stays "due".
    const again = await request(app).post(`${api}/${item.id}/advance`).set(auth).send({ stage: "connected" });
    expect(again.body.item.nextActionAt).toBeNull();
    expect(again.body.item.history).toHaveLength(3);

    expect((await request(app).post(`${api}/${item.id}/advance`).set(auth).send({ stage: "ghosted" })).status).toBe(400);
  });

  it("marks the linked lead replied and writes an outreach activity on its timeline", async () => {
    const l = await lead();
    const item = await create({ leadId: String(l._id), linkedinUrl: profile("asha-rao") });

    await request(app).post(`${api}/${item.id}/advance`).set(auth).send({ stage: "messaged" });
    let saved = await Lead.findById(l._id).exec();
    expect(saved?.stage).toBe("contacted");
    expect(saved?.lastContactedAt).toBeInstanceOf(Date);
    expect(saved?.activities).toMatchObject([{ type: "outreach", summary: "Messaged on LinkedIn", ref: item.id }]);

    const res = await request(app).post(`${api}/${item.id}/advance`).set(auth).send({ stage: "replied", note: "Interested in a demo." });
    expect(res.status).toBe(200);
    saved = await Lead.findById(l._id).exec();
    expect(saved?.stage).toBe("replied");
    expect(saved?.activities).toHaveLength(2);
    expect(saved?.activities[1]).toMatchObject({ type: "outreach", summary: "Replied on LinkedIn", ref: item.id });
  });

  it("never drags a closed lead back into the funnel", async () => {
    const l = await lead({ stage: "won" });
    const item = await create({ leadId: String(l._id), linkedinUrl: profile("asha-rao") });
    await request(app).post(`${api}/${item.id}/advance`).set(auth).send({ stage: "replied" });
    const saved = await Lead.findById(l._id).exec();
    expect(saved?.stage).toBe("won");
    expect(saved?.activities).toHaveLength(1);
  });

  it("works for a target with no lead", async () => {
    const item = await create({ name: "Ravi Kumar", linkedinUrl: profile("ravi") });
    const res = await request(app).post(`${api}/${item.id}/advance`).set(auth).send({ stage: "replied" });
    expect(res.status).toBe(200);
    expect(res.body.item.stage).toBe("replied");
  });
});

describe("outreach: due", () => {
  it("lists overdue targets oldest first, skipping finished ones", async () => {
    const day = 86_400_000;
    const now = Date.now();
    const b = await create({ name: "B", linkedinUrl: profile("b"), nextActionAt: new Date(now - day).toISOString() });
    const a = await create({ name: "A", linkedinUrl: profile("a"), nextActionAt: new Date(now - 2 * day).toISOString() });
    await create({ name: "C", linkedinUrl: profile("c"), nextActionAt: new Date(now + day).toISOString() });
    await create({ name: "D", linkedinUrl: profile("d"), stage: "won", nextActionAt: new Date(now - 3 * day).toISOString() });
    await create({ name: "E", linkedinUrl: profile("e") });

    const due = await request(app).get(`${api}/due`).set(auth);
    expect(due.status).toBe(200);
    expect(due.body.items.map((t: { id: string }) => t.id)).toEqual([a.id, b.id]);

    const list = await request(app).get(`${api}?due=true`).set(auth);
    expect(list.body.items.map((t: { id: string }) => t.id)).toEqual([a.id, b.id]);
    expect(list.body.meta.total).toBe(2);
  });
});

describe("outreach: render", () => {
  const text = "Hi {{first_name}}, loved what {{company}} is doing in {{city|your city}}. — {{sender_name}}";

  it("renders a LinkedIn template with the linked lead's fields and remembers the template", async () => {
    const l = await lead({ city: "Jaipur" });
    const item = await create({ leadId: String(l._id), linkedinUrl: profile("asha-rao") });
    const template = await EmailTemplate.create({ name: "Intro", channel: "linkedin", category: "cold", text });

    const res = await request(app).post(`${api}/${item.id}/render`).set(auth).send({ templateId: String(template._id) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "Hi Asha, loved what Rao Interiors is doing in Jaipur. — Maple Studios", missing: [] });
    expect((await OutreachTarget.findById(item.id).exec())?.templateId?.toString()).toBe(String(template._id));
  });

  it("falls back to the target's own name, company and role when no lead is linked, and reports what is missing", async () => {
    const item = await create({ name: "Ravi Kumar", company: "Kumar Designs", role: "Director", linkedinUrl: profile("ravi") });
    const template = await EmailTemplate.create({
      name: "Intro",
      channel: "linkedin",
      category: "cold",
      text: `${text} ({{role}}, {{email}})`,
    });
    const res = await request(app).post(`${api}/${item.id}/render`).set(auth).send({ templateId: String(template._id) });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Hi Ravi, loved what Kumar Designs is doing in your city. — Maple Studios (Director, )");
    expect(res.body.missing).toEqual(["email"]);
  });

  it("refuses an email template and 404s an unknown one", async () => {
    const item = await create({ name: "Ravi Kumar", linkedinUrl: profile("ravi") });
    const email = await EmailTemplate.create({ name: "Mail", channel: "email", category: "cold", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });
    const wrong = await request(app).post(`${api}/${item.id}/render`).set(auth).send({ templateId: String(email._id) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/LinkedIn template/);

    const missing = await request(app).post(`${api}/${item.id}/render`).set(auth).send({ templateId: "0123456789abcdef01234567" });
    expect(missing.status).toBe(404);
  });
});
