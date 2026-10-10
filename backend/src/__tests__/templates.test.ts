import request from "supertest";
import { Types } from "mongoose";
import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../app.js";
import { signAccessToken } from "../middleware/auth.js";
import { setMailProvider, type MailMessage } from "../lib/mail/provider.js";
import { EmailTemplate } from "../modules/templates/template.model.js";
import { Campaign } from "../modules/campaigns/campaign.model.js";
import { Lead } from "../modules/leads/lead.model.js";

const app = createApp();

// A real access token: requireAdmin verifies the signature only, so no
// AdminUser row is needed.
const token = signAccessToken({ sub: new Types.ObjectId().toString(), email: "owner@test.local", role: "owner", ver: 0 });
const auth = (r: request.Test) => r.set("authorization", `Bearer ${token}`);

const emailTemplate = {
  name: "Cold intro",
  channel: "email",
  category: "cold",
  subject: "Hi {{first_name|there}}, about {{company}}",
  html:
    "<h1>Hello</h1><p>Hi {{first_name|there}},</p><p>We help {{company}} with {{custom_focus}}.</p>" +
    '<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
};

async function createTemplate(body: Record<string, unknown> = emailTemplate) {
  const res = await auth(request(app).post("/api/v1/admin/templates")).send(body);
  expect(res.status).toBe(201);
  return res.body.item as { id: string; text: string; mergeFields: string[]; subject: string };
}

afterEach(() => setMailProvider(null));

describe("templates", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/v1/admin/templates");
    expect(res.status).toBe(401);
  });

  it("creates an email template, deriving text from the html and listing its merge fields", async () => {
    const item = await createTemplate();
    expect(item.text).toContain("Hi {{first_name|there}},");
    expect(item.text).toContain("Unsubscribe ({{unsubscribe_url}})");
    expect(item.text).not.toContain("<");
    expect(item.mergeFields).toEqual(["company", "custom_focus", "first_name", "unsubscribe_url"]);
  });

  it("insists on a subject and html for email, and on short text for linkedin", async () => {
    const noParts = await auth(request(app).post("/api/v1/admin/templates")).send({
      name: "Broken",
      channel: "email",
    });
    expect(noParts.status).toBe(400);
    expect(noParts.body.details.map((d: { field: string }) => d.field).sort()).toEqual(["html", "subject"]);

    const tooLong = await auth(request(app).post("/api/v1/admin/templates")).send({
      name: "Essay",
      channel: "linkedin",
      text: "x".repeat(3001),
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.details[0].field).toBe("text");

    const li = await auth(request(app).post("/api/v1/admin/templates")).send({
      name: "Connection note",
      channel: "linkedin",
      subject: "ignored",
      text: "Hi {{first_name}}, loved your work at {{company}}.",
    });
    expect(li.status).toBe(201);
    expect(li.body.item.subject).toBe("");
    expect(li.body.item.html).toBe("");
  });

  it("lists by channel, reads, patches and deletes", async () => {
    const created = await createTemplate();
    await createTemplate({ name: "LI", channel: "linkedin", text: "Hello {{first_name}}" });

    const emails = await auth(request(app).get("/api/v1/admin/templates?channel=email"));
    expect(emails.status).toBe(200);
    expect(emails.body.items).toHaveLength(1);
    expect(emails.body.meta.total).toBe(1);

    const one = await auth(request(app).get(`/api/v1/admin/templates/${created.id}`));
    expect(one.status).toBe(200);
    expect(one.body.item.name).toBe("Cold intro");

    // A blank text asks for a fresh derivation from the (new) html.
    const patched = await auth(request(app).patch(`/api/v1/admin/templates/${created.id}`)).send({
      subject: "Quick one for {{company}}",
      html: "<p>Short and sweet, {{first_name}}.</p>",
      text: "",
    });
    expect(patched.status).toBe(200);
    expect(patched.body.item.subject).toBe("Quick one for {{company}}");
    expect(patched.body.item.text).toBe("Short and sweet, {{first_name}}.");
    expect(patched.body.item.mergeFields).toEqual(["company", "first_name"]);

    // Switching channel drops the email-only parts rather than carrying them along.
    const switched = await auth(request(app).patch(`/api/v1/admin/templates/${created.id}`)).send({
      channel: "linkedin",
      text: "Hi {{first_name}}, fancy a chat?",
    });
    expect(switched.status).toBe(200);
    expect(switched.body.item).toMatchObject({ channel: "linkedin", subject: "", html: "", preheader: "" });
    expect((await EmailTemplate.findById(created.id).lean().exec())?.subject).toBeUndefined();

    const gone = await auth(request(app).delete(`/api/v1/admin/templates/${created.id}`));
    expect(gone.status).toBe(200);
    expect(await EmailTemplate.findById(created.id).exec()).toBeNull();

    const missing = await auth(request(app).get(`/api/v1/admin/templates/${created.id}`));
    expect(missing.status).toBe(404);
  });

  it("renders with sample data and reports what the context could not supply", async () => {
    const { id } = await createTemplate();

    const sample = await auth(request(app).post(`/api/v1/admin/templates/${id}/render`)).send({});
    expect(sample.status).toBe(200);
    expect(sample.body.subject).toBe("Hi Asha, about Rao Interiors");
    expect(sample.body.html).toContain("We help Rao Interiors with .");
    expect(sample.body.missing).toEqual(["custom_focus"]);

    const filled = await auth(request(app).post(`/api/v1/admin/templates/${id}/render`)).send({
      sample: { custom_focus: "booking automation" },
    });
    expect(filled.body.html).toContain("We help Rao Interiors with booking automation.");
    expect(filled.body.missing).toEqual([]);
  });

  it("renders with a real lead, escaping html but not the subject", async () => {
    const { id } = await createTemplate();
    const lead = await Lead.create({
      firstName: "Ravi",
      lastName: "Verma",
      email: "ravi@verma.example",
      company: "Verma & Sons",
      custom: { focus: "front-desk bookings" },
    });

    const res = await auth(request(app).post(`/api/v1/admin/templates/${id}/render`)).send({ leadId: String(lead._id) });
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe("Hi Ravi, about Verma & Sons");
    expect(res.body.html).toContain("We help Verma &amp; Sons with front-desk bookings.");
    expect(res.body.text).toContain("Verma & Sons");
    expect(res.body.missing).toEqual([]);

    const unknown = await auth(request(app).post(`/api/v1/admin/templates/${id}/render`)).send({
      leadId: new Types.ObjectId().toString(),
    });
    expect(unknown.status).toBe(404);
  });

  it("test-sends through the configured provider and says when that was a dry run", async () => {
    const { id } = await createTemplate();

    const dry = await auth(request(app).post(`/api/v1/admin/templates/${id}/test-send`)).send({ to: "me@maple.example" });
    expect(dry.status).toBe(200);
    expect(dry.body.ok).toBe(true);
    expect(dry.body.dryRun).toBe(true);
    expect(dry.body.providerId).toMatch(/^dry-/);

    const sent: MailMessage[] = [];
    setMailProvider({
      name: "resend",
      async send(message) {
        sent.push(message);
        return { id: "re_123" };
      },
    });
    const live = await auth(request(app).post(`/api/v1/admin/templates/${id}/test-send`)).send({ to: "Me@Maple.example" });
    expect(live.body).toEqual({ ok: true, dryRun: false, providerId: "re_123" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("me@maple.example");
    expect(sent[0]?.subject).toBe("Hi Asha, about Rao Interiors");

    const li = await createTemplate({ name: "LI", channel: "linkedin", text: "Hello {{first_name}}" });
    const refused = await auth(request(app).post(`/api/v1/admin/templates/${li.id}/test-send`)).send({ to: "me@maple.example" });
    expect(refused.status).toBe(400);
  });

  it("refuses to delete a template an unfinished campaign still uses", async () => {
    const { id } = await createTemplate();
    const campaign = await Campaign.create({
      name: "Hotels",
      from: { name: "Aditya", email: "aditya@maple.example" },
      audience: { filter: { tags: ["hotel"] } },
      steps: [{ templateId: id, delayDays: 0, stopIfReplied: true }],
      schedule: { startAt: new Date() },
    });

    const blocked = await auth(request(app).delete(`/api/v1/admin/templates/${id}`));
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("CONFLICT");

    campaign.status = "completed";
    await campaign.save();
    const allowed = await auth(request(app).delete(`/api/v1/admin/templates/${id}`));
    expect(allowed.status).toBe(200);
  });
});
