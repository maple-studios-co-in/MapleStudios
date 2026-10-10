import crypto from "node:crypto";
import request from "supertest";
import { Types } from "mongoose";
import { DateTime } from "luxon";
import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../app.js";
import { signAccessToken } from "../middleware/auth.js";
import { readSignedId } from "../lib/crypto.js";
import { setMailProvider, type MailMessage } from "../lib/mail/provider.js";
import { EmailTemplate } from "../modules/templates/template.model.js";
import { Lead } from "../modules/leads/lead.model.js";
import { Segment } from "../modules/leads/segment.model.js";
import { CampaignMessage } from "../modules/campaigns/message.model.js";
import { Suppression } from "../modules/campaigns/suppression.model.js";
import { runCampaignTick, setResendWebhookSecret } from "../modules/campaigns/campaign.service.js";

const app = createApp();
const token = signAccessToken({ sub: new Types.ObjectId().toString(), email: "owner@test.local", role: "owner", ver: 0 });
const auth = (r: request.Test) => r.set("authorization", `Bearer ${token}`);

// --- clock ----------------------------------------------------------------
// The tick takes `now` explicitly, so every instant here is a wall-clock time
// on the first Monday after today, in the campaign's timezone. startAt is an
// hour ago, which makes step 0 due immediately and well before any tick.
const TZ = "Asia/Kolkata";
const monday = (() => {
  let d = DateTime.now().setZone(TZ).plus({ days: 1 }).startOf("day");
  while (d.weekday !== 1) d = d.plus({ days: 1 });
  return d;
})();
const local = (dayOffset: number, hour: number, minute = 0) =>
  monday.plus({ days: dayOffset }).set({ hour, minute }).toJSDate();
const MON_1030 = local(0, 10, 30);
const MON_2000 = local(0, 20, 0);
const SAT_1030 = local(5, 10, 30);
const TUE_1030 = local(1, 10, 30);
const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const hourAgo = () => new Date(Date.now() - 3_600_000).toISOString();

// --- fixtures -------------------------------------------------------------
async function makeTemplate(overrides: Record<string, unknown> = {}) {
  return EmailTemplate.create({
    name: "Intro",
    channel: "email",
    category: "cold",
    subject: "Hello {{first_name}}",
    html: '<p>Hi {{first_name}} from {{company}}.</p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
    text: "Hi {{first_name}} from {{company}}. Unsubscribe: {{unsubscribe_url}}",
    ...overrides,
  });
}

let leadSeq = 0;
async function makeLead(overrides: Record<string, unknown> = {}) {
  leadSeq += 1;
  return Lead.create({
    firstName: `Lead${leadSeq}`,
    company: `Company ${leadSeq}`,
    email: `lead${leadSeq}@example.test`,
    tags: ["hotel"],
    ...overrides,
  });
}

function campaignBody(templateId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: "Hotels Q4",
    from: { name: "Aditya", email: "aditya@maple.example" },
    replyTo: "hello@maple.example",
    audience: { filter: { tags: ["hotel"] } },
    steps: [{ templateId, delayDays: 0 }],
    schedule: { startAt: hourAgo(), dailyCap: 30, window: { start: "09:30", end: "18:00" }, weekdaysOnly: true, timezone: TZ },
    ...overrides,
  };
}

async function createCampaign(body: Record<string, unknown>) {
  const res = await auth(request(app).post("/api/v1/admin/campaigns")).send(body);
  expect(res.status).toBe(201);
  return res.body.item as { id: string; status: string };
}

async function startCampaign(id: string) {
  const res = await auth(request(app).post(`/api/v1/admin/campaigns/${id}/start`));
  expect(res.status).toBe(200);
  return res.body.item;
}

/** A started campaign over `leadCount` hotel leads; two steps (3 days apart) unless `steps` is 1. */
async function runningCampaign(leadCount = 2, overrides: Record<string, unknown> = {}, steps: 1 | 2 = 2) {
  const template = await makeTemplate();
  const followup = await makeTemplate({ name: "Nudge", subject: "Re: {{company}}" });
  const leads = [];
  for (let i = 0; i < leadCount; i++) leads.push(await makeLead());
  const campaign = await createCampaign(
    campaignBody(String(template._id), {
      steps: [
        { templateId: String(template._id), delayDays: 0 },
        ...(steps === 2 ? [{ templateId: String(followup._id), delayDays: 3 }] : []),
      ],
      ...overrides,
    })
  );
  await startCampaign(campaign.id);
  return { campaign, leads, template, followup };
}

function fakeProvider(opts: { fail?: boolean } = {}) {
  const sent: MailMessage[] = [];
  setMailProvider({
    name: "resend",
    async send(message) {
      if (opts.fail) throw new Error("Resend 500: provider unavailable");
      sent.push(message);
      return { id: `fake-${sent.length}` };
    },
  });
  return sent;
}

const getCampaign = async (id: string) => (await auth(request(app).get(`/api/v1/admin/campaigns/${id}`))).body.item;

afterEach(() => {
  setMailProvider(null);
  setResendWebhookSecret(undefined);
});

// --- tests ----------------------------------------------------------------

describe("campaigns: auth and validation", () => {
  it("requires auth on the admin routes", async () => {
    expect((await request(app).get("/api/v1/admin/campaigns")).status).toBe(401);
    expect((await request(app).post("/api/v1/admin/campaigns").send({})).status).toBe(401);
  });

  it("creates a draft with defaults and rejects bad references", async () => {
    const template = await makeTemplate();
    const created = await createCampaign(
      campaignBody(String(template._id), { schedule: { startAt: hourAgo(), timezone: TZ } })
    );
    expect(created.status).toBe("draft");

    const item = await getCampaign(created.id);
    expect(item.schedule).toMatchObject({ dailyCap: 30, window: { start: "09:30", end: "18:00" }, weekdaysOnly: true, timezone: TZ });
    expect(item.audience).toEqual({ filter: { tags: ["hotel"] } });
    expect(item.steps).toEqual([{ templateId: String(template._id), delayDays: 0, stopIfReplied: true }]);
    expect(item.stats).toMatchObject({ recipients: 0, queued: 0, sent: 0 });

    const ghost = await auth(request(app).post("/api/v1/admin/campaigns")).send(
      campaignBody(new Types.ObjectId().toString())
    );
    expect(ghost.status).toBe(400);
    expect(ghost.body.details[0].field).toBe("steps.0.templateId");

    const linkedin = await makeTemplate({ channel: "linkedin", subject: undefined, html: undefined, text: "hi" });
    const wrongChannel = await auth(request(app).post("/api/v1/admin/campaigns")).send(campaignBody(String(linkedin._id)));
    expect(wrongChannel.status).toBe(400);

    const badSegment = await auth(request(app).post("/api/v1/admin/campaigns")).send(
      campaignBody(String(template._id), { audience: { segmentId: new Types.ObjectId().toString() } })
    );
    expect(badSegment.status).toBe(400);
    expect(badSegment.body.details[0].field).toBe("audience.segmentId");
  });

  it("validates steps, audience shape, window and timezone", async () => {
    const template = await makeTemplate();
    const id = String(template._id);
    const post = (body: Record<string, unknown>) => auth(request(app).post("/api/v1/admin/campaigns")).send(body);

    expect((await post(campaignBody(id, { steps: [{ templateId: id, delayDays: 2 }] }))).status).toBe(400);
    expect((await post(campaignBody(id, { steps: [{ templateId: id, delayDays: 0 }, { templateId: id, delayDays: 0 }] }))).status).toBe(400);
    expect((await post(campaignBody(id, { audience: { filter: { tags: ["a"] }, leadIds: [id] } }))).status).toBe(400);
    expect((await post(campaignBody(id, { audience: { filter: { nope: 1 } } }))).status).toBe(400);
    expect((await post(campaignBody(id, { schedule: { startAt: hourAgo(), window: { start: "18:00", end: "09:00" } } }))).status).toBe(400);
    expect((await post(campaignBody(id, { schedule: { startAt: hourAgo(), timezone: "Mars/Olympus" } }))).status).toBe(400);
    expect((await post(campaignBody(id, { schedule: { startAt: "tomorrow-ish" } }))).status).toBe(400);
  });

  it("edits drafts only and deletes only inactive campaigns", async () => {
    const template = await makeTemplate();
    await makeLead();
    const created = await createCampaign(campaignBody(String(template._id)));

    const renamed = await auth(request(app).patch(`/api/v1/admin/campaigns/${created.id}`)).send({ name: "Hotels Q4 v2" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.item.name).toBe("Hotels Q4 v2");

    await startCampaign(created.id);
    const locked = await auth(request(app).patch(`/api/v1/admin/campaigns/${created.id}`)).send({ name: "x" });
    expect(locked.status).toBe(409);
    expect((await auth(request(app).delete(`/api/v1/admin/campaigns/${created.id}`))).status).toBe(409);

    await auth(request(app).post(`/api/v1/admin/campaigns/${created.id}/cancel`));
    expect((await auth(request(app).delete(`/api/v1/admin/campaigns/${created.id}`))).status).toBe(200);
    expect(await CampaignMessage.countDocuments({ campaignId: created.id }).exec()).toBe(0);
  });
});

describe("campaigns: enrolment and preview", () => {
  it("start enrols only leads that can be emailed", async () => {
    const template = await makeTemplate();
    const ok1 = await makeLead({ firstName: "Asha" });
    const ok2 = await makeLead();
    await makeLead({ suppressed: true });
    await makeLead({ unsubscribedAt: new Date(), stage: "unsubscribed" });
    await makeLead({ email: undefined, phone: "+919999999991" });
    const listed = await makeLead();
    await Suppression.create({ email: listed.email, reason: "manual" });
    await makeLead({ tags: ["cafe"] });

    const created = await createCampaign(campaignBody(String(template._id)));
    const started = await startCampaign(created.id);
    expect(started.status).toBe("running");
    expect(started.startedAt).toBeTruthy();
    expect(started.stats).toMatchObject({ recipients: 2, queued: 2, sent: 0 });

    const messages = await CampaignMessage.find({ campaignId: created.id }).exec();
    expect(messages.map((m) => String(m.leadId)).sort()).toEqual([String(ok1._id), String(ok2._id)].sort());
    for (const m of messages) {
      expect(m.status).toBe("queued");
      expect(m.step).toBe(0);
      expect(m.scheduledFor.getTime()).toBeLessThanOrEqual(Date.now());
      // The token is the message id, signed - so the unsubscribe page can find it.
      expect(readSignedId(m.unsubscribeToken)).toBe(String(m._id));
    }

    const lead = await Lead.findById(ok1._id).exec();
    expect(lead?.activities.at(-1)).toMatchObject({ type: "email_queued", ref: created.id });

    const again = await auth(request(app).post(`/api/v1/admin/campaigns/${created.id}/start`));
    expect(again.status).toBe(409);
  });

  it("refuses to start with nobody to email", async () => {
    const template = await makeTemplate();
    await makeLead({ tags: ["cafe"] });
    const created = await createCampaign(campaignBody(String(template._id)));
    const res = await auth(request(app).post(`/api/v1/admin/campaigns/${created.id}/start`));
    expect(res.status).toBe(400);
    expect((await getCampaign(created.id)).status).toBe("draft");
  });

  it("previews the first step and resolves segment, lead-list and text-search audiences", async () => {
    const template = await makeTemplate();
    const asha = await makeLead({ firstName: "Asha", company: "Rao Interiors" });
    const ravi = await makeLead({ firstName: "Ravi", company: "Verma Hotels", tags: ["cafe"] });

    const byFilter = await createCampaign(campaignBody(String(template._id)));
    const preview = await auth(request(app).get(`/api/v1/admin/campaigns/${byFilter.id}/preview?limit=1`));
    expect(preview.status).toBe(200);
    expect(preview.body.recipients).toBe(1);
    expect(preview.body.samples).toHaveLength(1);
    expect(preview.body.samples[0]).toMatchObject({ leadId: String(asha._id), email: asha.email, subject: "Hello Asha" });
    expect(preview.body.samples[0].html).toContain("Rao Interiors");
    expect(preview.body.samples[0].html).toContain("/unsubscribe/preview");

    const segment = await Segment.create({ name: "Cafes", filter: { tags: ["cafe"] } });
    const bySegment = await createCampaign(campaignBody(String(template._id), { audience: { segmentId: String(segment._id) } }));
    const seg = await auth(request(app).get(`/api/v1/admin/campaigns/${bySegment.id}/preview`));
    expect(seg.body.samples.map((s: { leadId: string }) => s.leadId)).toEqual([String(ravi._id)]);

    const byIds = await createCampaign(
      campaignBody(String(template._id), { audience: { leadIds: [String(asha._id), String(ravi._id)] } })
    );
    expect((await auth(request(app).get(`/api/v1/admin/campaigns/${byIds.id}/preview`))).body.recipients).toBe(2);

    const byText = await createCampaign(campaignBody(String(template._id), { audience: { filter: { q: "Verma" } } }));
    const text = await auth(request(app).get(`/api/v1/admin/campaigns/${byText.id}/preview`));
    expect(text.body.samples.map((s: { leadId: string }) => s.leadId)).toEqual([String(ravi._id)]);

    const count = await auth(request(app).post("/api/v1/admin/campaigns/audience/count")).send({ filter: { tags: ["hotel"] } });
    expect(count.body).toEqual({ matched: 1, recipients: 1 });
  });
});

describe("campaigns: the tick", () => {
  it("sends due messages inside the window and schedules the next step", async () => {
    const { campaign, leads } = await runningCampaign(2);
    const sent = fakeProvider();

    await runCampaignTick(MON_1030);

    expect(sent).toHaveLength(2);
    const first = sent.find((m) => m.to === leads[0]?.email);
    expect(first).toBeTruthy();
    expect(first?.from).toEqual({ name: "Aditya", email: "aditya@maple.example" });
    expect(first?.replyTo).toBe("hello@maple.example");
    expect(first?.subject).toBe(`Hello ${leads[0]?.firstName}`);

    const message = await CampaignMessage.findOne({ campaignId: campaign.id, leadId: leads[0]?._id, step: 0 }).exec();
    const url = `http://localhost:3006/unsubscribe/${message?.unsubscribeToken}`;
    expect(first?.headers).toEqual({ "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(first?.html).toContain(`href="${url}"`);
    expect(first?.text).toContain(url);

    expect(message?.status).toBe("sent");
    expect(message?.sentAt?.getTime()).toBe(MON_1030.getTime());
    expect(message?.providerMessageId).toMatch(/^fake-/);
    expect(message?.attempts).toBe(1);

    // Step 2: three days later, same local time, in the campaign's timezone.
    const next = await CampaignMessage.findOne({ campaignId: campaign.id, leadId: leads[0]?._id, step: 1 }).exec();
    expect(next?.status).toBe("queued");
    expect(next?.scheduledFor.getTime()).toBe(DateTime.fromJSDate(MON_1030, { zone: TZ }).plus({ days: 3 }).toJSDate().getTime());

    const lead = await Lead.findById(leads[0]?._id).exec();
    expect(lead?.lastContactedAt?.getTime()).toBe(MON_1030.getTime());
    expect(lead?.activities.at(-1)).toMatchObject({ type: "email_sent", ref: campaign.id });

    const item = await getCampaign(campaign.id);
    expect(item.status).toBe("running");
    expect(item.stats).toMatchObject({ recipients: 2, sent: 2, queued: 2, failed: 0 });

    // The follow-ups are not due yet, so a second tick sends nothing new.
    await runCampaignTick(plusMinutes(MON_1030, 5));
    expect(sent).toHaveLength(2);

    // ...and go out once their day comes.
    await runCampaignTick(local(3, 11, 0));
    expect(sent).toHaveLength(4);
    expect(sent[2]?.subject).toMatch(/^Re: Company/);
    expect((await getCampaign(campaign.id)).status).toBe("completed");
  });

  it("sends nothing outside the window, on weekends, or past the daily cap", async () => {
    const { campaign } = await runningCampaign(2, { schedule: { startAt: hourAgo(), dailyCap: 1, timezone: TZ } });
    const sent = fakeProvider();

    await runCampaignTick(MON_2000);
    await runCampaignTick(SAT_1030);
    expect(sent).toHaveLength(0);
    expect(await CampaignMessage.countDocuments({ campaignId: campaign.id, status: "queued" }).exec()).toBe(2);

    await runCampaignTick(MON_1030);
    expect(sent).toHaveLength(1);
    await runCampaignTick(plusMinutes(MON_1030, 1));
    expect(sent).toHaveLength(1);

    await runCampaignTick(TUE_1030);
    expect(sent).toHaveLength(2);
    expect((await getCampaign(campaign.id)).stats).toMatchObject({ sent: 2, queued: 2 });
  });

  it("skips a lead who replied, or was suppressed, between enrolment and the send", async () => {
    const { campaign, leads } = await runningCampaign(3);
    const sent = fakeProvider();
    await Lead.updateOne({ _id: leads[0]?._id }, { $set: { stage: "replied" } }).exec();
    await Suppression.create({ email: leads[1]?.email, reason: "manual" });

    await runCampaignTick(MON_1030);

    expect(sent.map((m) => m.to)).toEqual([leads[2]?.email]);
    const replied = await CampaignMessage.findOne({ campaignId: campaign.id, leadId: leads[0]?._id }).exec();
    expect(replied?.status).toBe("skipped");
    expect(replied?.error).toBe("Lead replied.");
    const listed = await CampaignMessage.findOne({ campaignId: campaign.id, leadId: leads[1]?._id }).exec();
    expect(listed?.status).toBe("skipped");
    expect(await CampaignMessage.countDocuments({ campaignId: campaign.id, step: 1 }).exec()).toBe(1);
    expect((await getCampaign(campaign.id)).stats).toMatchObject({ sent: 1, replied: 1, queued: 1 });
  });

  it("retries a provider failure twice, fifteen minutes apart, then gives up", async () => {
    const { campaign } = await runningCampaign(1, {}, 1);
    fakeProvider({ fail: true });
    const id = { campaignId: campaign.id };

    await runCampaignTick(MON_1030);
    let message = await CampaignMessage.findOne(id).exec();
    expect(message).toMatchObject({ status: "queued", attempts: 1 });
    expect(message?.error).toContain("Resend 500");
    expect(message?.scheduledFor.getTime()).toBe(plusMinutes(MON_1030, 15).getTime());

    await runCampaignTick(plusMinutes(MON_1030, 5));
    expect((await CampaignMessage.findOne(id).exec())?.attempts).toBe(1);

    await runCampaignTick(plusMinutes(MON_1030, 15));
    message = await CampaignMessage.findOne(id).exec();
    expect(message).toMatchObject({ status: "queued", attempts: 2 });

    await runCampaignTick(plusMinutes(MON_1030, 30));
    message = await CampaignMessage.findOne(id).exec();
    expect(message).toMatchObject({ status: "failed", attempts: 3 });

    const item = await getCampaign(campaign.id);
    expect(item.stats).toMatchObject({ failed: 1, sent: 0, queued: 0 });
    expect(item.status).toBe("completed");
  });

  it("pauses, resumes and cancels", async () => {
    const { campaign } = await runningCampaign(2);
    const sent = fakeProvider();
    const act = (action: string) => auth(request(app).post(`/api/v1/admin/campaigns/${campaign.id}/${action}`));

    expect((await act("pause")).body.item.status).toBe("paused");
    expect((await act("pause")).status).toBe(409);
    await runCampaignTick(MON_1030);
    expect(sent).toHaveLength(0);

    expect((await act("resume")).body.item.status).toBe("running");
    await runCampaignTick(MON_1030);
    expect(sent).toHaveLength(2);

    const cancelled = await act("cancel");
    expect(cancelled.body.item.status).toBe("cancelled");
    expect(cancelled.body.item.stats).toMatchObject({ sent: 2, queued: 0 });
    expect(await CampaignMessage.countDocuments({ campaignId: campaign.id, status: "cancelled" }).exec()).toBe(2);
    expect((await act("cancel")).status).toBe(409);
    expect((await act("resume")).status).toBe(409);

    await runCampaignTick(local(3, 11, 0));
    expect(sent).toHaveLength(2);
  });

  it("lists messages joined with the lead", async () => {
    const { campaign, leads } = await runningCampaign(1);
    fakeProvider();
    await runCampaignTick(MON_1030);

    const res = await auth(request(app).get(`/api/v1/admin/campaigns/${campaign.id}/messages?status=sent`));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      status: "sent",
      step: 0,
      lead: { id: String(leads[0]?._id), email: leads[0]?.email, name: leads[0]?.firstName },
    });
    expect(res.body.items[0].sentAt).toBe(MON_1030.toISOString());

    const all = await auth(request(app).get(`/api/v1/admin/campaigns/${campaign.id}/messages`));
    expect(all.body.items.map((m: { status: string }) => m.status)).toEqual(["sent", "queued"]);
  });
});

describe("campaigns: unsubscribe", () => {
  it("honours a valid token on GET and POST and 404s anything else", async () => {
    const { campaign, leads } = await runningCampaign(2);
    fakeProvider();
    await runCampaignTick(MON_1030);
    const message = await CampaignMessage.findOne({ campaignId: campaign.id, leadId: leads[0]?._id, step: 0 }).exec();

    const res = await request(app).get(`/api/v1/unsubscribe/${message?.unsubscribeToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("unsubscribed");

    const lead = await Lead.findById(leads[0]?._id).exec();
    expect(lead?.unsubscribedAt).toBeTruthy();
    expect(lead?.stage).toBe("unsubscribed");
    expect(lead?.activities.at(-1)).toMatchObject({ type: "unsubscribed", ref: campaign.id });
    expect(await Suppression.findOne({ email: leads[0]?.email }).exec()).toMatchObject({ reason: "unsubscribe" });

    // Their follow-up is cancelled; the other lead's is untouched.
    const theirs = await CampaignMessage.findOne({ campaignId: campaign.id, leadId: leads[0]?._id, step: 1 }).exec();
    expect(theirs?.status).toBe("cancelled");
    const others = await CampaignMessage.findOne({ campaignId: campaign.id, leadId: leads[1]?._id, step: 1 }).exec();
    expect(others?.status).toBe("queued");
    expect((await getCampaign(campaign.id)).stats).toMatchObject({ unsubscribed: 1, queued: 1 });

    const again = await request(app).post(`/api/v1/unsubscribe/${message?.unsubscribeToken}`).type("form").send("List-Unsubscribe=One-Click");
    expect(again.status).toBe(200);

    const forged = `${message?.unsubscribeToken.split(".")[0]}.${"0".repeat(32)}`;
    const bad = await request(app).get(`/api/v1/unsubscribe/${forged}`);
    expect(bad.status).toBe(404);
    expect(bad.headers["content-type"]).toMatch(/text\/html/);
    expect(bad.text).not.toContain("You're unsubscribed");
    expect((await request(app).get("/api/v1/unsubscribe/garbage")).status).toBe(404);
  });
});

describe("campaigns: Resend webhook", () => {
  const secretBytes = crypto.randomBytes(24);
  const secret = `whsec_${secretBytes.toString("base64")}`;

  function sign(body: string, opts: { timestamp?: number; key?: Buffer } = {}) {
    const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
    const id = "msg_test_1";
    const sig = crypto.createHmac("sha256", opts.key ?? secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
    return { "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${sig}` };
  }

  const post = (body: string, headers: Record<string, string>) =>
    request(app).post("/api/v1/webhooks/resend").set(headers).set("content-type", "application/json").send(body);

  it("is 503 until a secret is configured", async () => {
    setResendWebhookSecret(null);
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "x" } });
    const res = await post(body, sign(body));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("NOT_CONFIGURED");
  });

  it("rejects bad or stale signatures", async () => {
    setResendWebhookSecret(secret);
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "x" } });

    expect((await post(body, sign(body, { key: crypto.randomBytes(24) }))).status).toBe(401);
    expect((await post(body, sign(body, { timestamp: Math.floor(Date.now() / 1000) - 600 }))).status).toBe(401);
    expect((await post(body, {})).status).toBe(401);
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it("records deliveries, and turns bounces and complaints into suppressions", async () => {
    setResendWebhookSecret(secret);
    const { campaign, leads } = await runningCampaign(3);
    fakeProvider();
    await runCampaignTick(MON_1030);
    const messages = await CampaignMessage.find({ campaignId: campaign.id, step: 0 }).sort({ leadId: 1 }).exec();
    const byLead = (i: number) => messages.find((m) => String(m.leadId) === String(leads[i]?._id));

    const delivered = JSON.stringify({ type: "email.delivered", data: { email_id: byLead(0)?.providerMessageId } });
    expect((await post(delivered, sign(delivered))).body).toEqual({ ok: true, handled: true, type: "email.delivered" });
    expect((await CampaignMessage.findById(byLead(0)?._id).exec())?.status).toBe("delivered");

    const bounced = JSON.stringify({
      type: "email.bounced",
      data: { email_id: byLead(1)?.providerMessageId, bounce: { message: "The recipient's mailbox does not exist." } },
    });
    expect((await post(bounced, sign(bounced))).status).toBe(200);
    expect((await CampaignMessage.findById(byLead(1)?._id).exec())).toMatchObject({ status: "bounced", error: "The recipient's mailbox does not exist." });
    const bouncedLead = await Lead.findById(leads[1]?._id).exec();
    expect(bouncedLead?.suppressed).toBe(true);
    expect(bouncedLead?.activities.at(-1)).toMatchObject({ type: "email_bounced", ref: campaign.id });
    expect(await Suppression.findOne({ email: leads[1]?.email }).exec()).toMatchObject({ reason: "bounce" });
    expect((await CampaignMessage.findOne({ campaignId: campaign.id, leadId: leads[1]?._id, step: 1 }).exec())?.status).toBe("cancelled");

    const complained = JSON.stringify({ type: "email.complained", data: { email_id: byLead(2)?.providerMessageId } });
    expect((await post(complained, sign(complained))).status).toBe(200);
    expect((await Lead.findById(leads[2]?._id).exec())?.suppressed).toBe(true);
    expect(await Suppression.findOne({ email: leads[2]?.email }).exec()).toMatchObject({ reason: "complaint" });

    expect((await getCampaign(campaign.id)).stats).toMatchObject({ sent: 3, delivered: 1, bounced: 1, complained: 1, queued: 1 });

    const unknown = JSON.stringify({ type: "email.opened", data: { email_id: byLead(0)?.providerMessageId } });
    expect((await post(unknown, sign(unknown))).body).toEqual({ ok: true, handled: false, type: "email.opened" });
    const stranger = JSON.stringify({ type: "email.bounced", data: { email_id: "not-ours" } });
    expect((await post(stranger, sign(stranger))).body).toMatchObject({ ok: true, handled: false });
  });
});

describe("campaigns: suppressions", () => {
  it("adds, lists and removes manual blocks, keeping the lead flag in step", async () => {
    const lead = await makeLead();
    const added = await auth(request(app).post("/api/v1/admin/suppressions")).send({ email: lead.email?.toUpperCase(), note: "asked on a call" });
    expect(added.status).toBe(201);
    expect(added.body.item).toMatchObject({ email: lead.email, reason: "manual", note: "asked on a call" });
    expect((await Lead.findById(lead._id).exec())?.suppressed).toBe(true);

    const list = await auth(request(app).get("/api/v1/admin/suppressions"));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);

    const removed = await auth(request(app).delete(`/api/v1/admin/suppressions/${added.body.item.id}`));
    expect(removed.body).toEqual({ ok: true });
    expect((await Lead.findById(lead._id).exec())?.suppressed).toBe(false);
    expect((await auth(request(app).delete(`/api/v1/admin/suppressions/${added.body.item.id}`))).status).toBe(404);
  });
});
