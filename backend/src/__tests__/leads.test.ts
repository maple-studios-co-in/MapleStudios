import request from "supertest";
import { describe, it, expect, vi } from "vitest";

// env.ts reads the key when it is first imported, and imports are hoisted
// above ordinary statements - so this assignment has to be hoisted too.
vi.hoisted(() => {
  process.env.LEGACY_ADMIN_KEY = "test-admin-key";
});

import { createApp } from "../app.js";
import { Lead } from "../modules/leads/lead.model.js";
import { Segment } from "../modules/leads/segment.model.js";
import * as leads from "../modules/leads/lead.service.js";
import { isValidE164, normalisePhone } from "../lib/phone.js";
import { parseCsv } from "../lib/csvParse.js";

const app = createApp();
const KEY = "test-admin-key";
const get = (path: string) => request(app).get(path).set("x-admin-key", KEY);
const post = (path: string) => request(app).post(path).set("x-admin-key", KEY);
const patch = (path: string) => request(app).patch(path).set("x-admin-key", KEY);
const del = (path: string) => request(app).delete(path).set("x-admin-key", KEY);
const importCsv = (path: string, csv: string, q: Record<string, string> = {}) =>
  post(path).query(q).set("content-type", "text/csv").send(csv);

const asha = {
  firstName: "Asha",
  lastName: "Rao",
  email: "Asha@Example.com",
  company: "Rao Interiors",
  city: "Jaipur",
  tags: ["hotel", "vip"],
};
const ravi = { firstName: "Ravi", phone: "98765 43210", company: "Ravi Hospitality", city: "Delhi", tags: ["cafe"] };
const meera = { firstName: "Meera", email: "meera@example.com", stage: "qualified", owner: "aditya", industry: "Hospitality" };

async function create(input: Record<string, unknown>) {
  const res = await post("/api/v1/admin/leads").send(input);
  expect(res.status).toBe(201);
  return res.body.item;
}

describe("lib/phone", () => {
  it("normalises Indian spellings to E.164 with the default country", () => {
    for (const raw of ["98765 43210", "9876543210", "098765-43210", "91 98765 43210", "+91 (98765) 43210", "+919876543210"]) {
      expect(normalisePhone(raw)).toBe("+919876543210");
    }
  });

  it("keeps foreign numbers and honours another default country", () => {
    expect(normalisePhone("+44 20 7123 4567")).toBe("+442071234567");
    expect(normalisePhone("442071234567")).toBe("+442071234567");
    expect(normalisePhone("2071234567", "+44")).toBe("+442071234567");
  });

  it("rejects what cannot be a phone number", () => {
    for (const raw of ["", "   ", "12345", "+0123456789", "98765abc43210", "+91 98765 4321012345", "98765+43210"]) {
      expect(normalisePhone(raw)).toBeNull();
    }
    expect(normalisePhone(9876543210)).toBeNull();
    expect(normalisePhone(null)).toBeNull();
  });

  it("isValidE164 insists on the plus and a non-zero first digit", () => {
    expect(isValidE164("+919876543210")).toBe(true);
    expect(isValidE164("919876543210")).toBe(false);
    expect(isValidE164("+0919876543210")).toBe(false);
    expect(isValidE164("+1234567")).toBe(false);
  });
});

describe("lib/csvParse", () => {
  it("handles quoted commas and doubled quotes", () => {
    const { header, rows } = parseCsv('name,company\n"Rao, Asha","Rao ""Interiors"" Ltd"\n');
    expect(header).toEqual(["name", "company"]);
    expect(rows).toEqual([["Rao, Asha", 'Rao "Interiors" Ltd']]);
  });

  it("handles a BOM, CRLF line ends and a trailing newline", () => {
    const { header, rows } = parseCsv("﻿a,b\r\n1,2\r\n3,4\r\n");
    expect(header).toEqual(["a", "b"]);
    expect(rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("keeps newlines inside quotes and skips blank lines", () => {
    const { rows } = parseCsv('a,b\n"line one\nline two",x\n\n1,2\n\n3');
    expect(rows).toEqual([["line one\nline two", "x"], ["1", "2"], ["3"]]);
  });

  it("treats a mid-field quote as a character and trims the header", () => {
    const { header, rows } = parseCsv(' size , note \n5" screen,ok');
    expect(header).toEqual(["size", "note"]);
    expect(rows).toEqual([['5" screen', "ok"]]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual({ header: [], rows: [] });
  });
});

describe("admin lead routes", () => {
  it("requires the admin key", async () => {
    expect((await request(app).get("/api/v1/admin/leads")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/leads").set("x-admin-key", "wrong")).status).toBe(401);
    expect((await request(app).post("/api/v1/admin/leads/import").set("content-type", "text/csv").send("a,b")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/segments")).status).toBe(401);
  });

  it("creates leads, normalising email and phone", async () => {
    const a = await create(asha);
    expect(a.email).toBe("asha@example.com");
    expect(a.stage).toBe("new");
    expect(a.tags).toEqual(["hotel", "vip"]);
    expect(a.phone).toBeNull();
    expect(a.createdAt).toBeTruthy();

    const r = await create(ravi);
    expect(r.phone).toBe("+919876543210");
    expect(r.email).toBeNull();
  });

  it("validates the contact fields", async () => {
    const none = await post("/api/v1/admin/leads").send({ firstName: "Nobody" });
    expect(none.status).toBe(400);
    expect(none.body.details[0].field).toBe("email");

    const badPhone = await post("/api/v1/admin/leads").send({ firstName: "Bad", phone: "12345" });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.details[0].field).toBe("phone");

    const badEmail = await post("/api/v1/admin/leads").send({ firstName: "Bad", email: "nope" });
    expect(badEmail.status).toBe(400);
  });

  it("refuses a second lead with the same email or phone", async () => {
    await create(asha);
    await create(ravi);
    const dupEmail = await post("/api/v1/admin/leads").send({ firstName: "Twin", email: "ASHA@example.com" });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.code).toBe("CONFLICT");
    const dupPhone = await post("/api/v1/admin/leads").send({ firstName: "Twin", phone: "+91 98765 43210" });
    expect(dupPhone.status).toBe(409);
  });

  it("lists, filters, searches, sorts and pages", async () => {
    await create(asha);
    await create(ravi);
    await create(meera);

    const all = await get("/api/v1/admin/leads");
    expect(all.status).toBe(200);
    expect(all.body.meta).toEqual({ total: 3, page: 1, limit: 25, pages: 1 });
    expect(all.body.items).toHaveLength(3);

    const names = async (qs: string) => {
      const res = await get(`/api/v1/admin/leads?${qs}`);
      expect(res.status).toBe(200);
      return res.body.items.map((i: { firstName: string }) => i.firstName).sort();
    };
    expect(await names("stage=qualified")).toEqual(["Meera"]);
    expect(await names("stage=new,qualified")).toEqual(["Asha", "Meera", "Ravi"]);
    expect(await names("tags=hotel,cafe")).toEqual(["Asha", "Ravi"]);
    expect(await names("hasEmail=true")).toEqual(["Asha", "Meera"]);
    expect(await names("hasPhone=true")).toEqual(["Ravi"]);
    expect(await names("hasEmail=false")).toEqual(["Ravi"]);
    expect(await names("owner=aditya")).toEqual(["Meera"]);
    expect(await names("city=Jaipur&tags=hotel")).toEqual(["Asha"]);
    expect(await names("industry=Hospitality")).toEqual(["Meera"]);
    expect(await names("q=Rao")).toEqual(["Asha"]);

    const byCompany = await get("/api/v1/admin/leads?sort=company");
    expect(byCompany.body.items.map((i: { company: string }) => i.company)).toEqual(["", "Rao Interiors", "Ravi Hospitality"]);

    const page2 = await get("/api/v1/admin/leads?limit=2&page=2");
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.meta.pages).toBe(2);

    expect((await get("/api/v1/admin/leads?stage=bogus")).status).toBe(400);
    expect((await get("/api/v1/admin/leads?limit=1000")).status).toBe(400);
  });

  it("reads one lead and 404s unknown or malformed ids", async () => {
    const a = await create(asha);
    const found = await get(`/api/v1/admin/leads/${a.id}`);
    expect(found.status).toBe(200);
    expect(found.body.item.id).toBe(a.id);
    expect((await get("/api/v1/admin/leads/0123456789abcdef01234567")).status).toBe(404);
    expect((await get("/api/v1/admin/leads/not-an-id")).status).toBe(400);
  });

  it("patches fields and records a stage activity only when the stage changes", async () => {
    const a = await create(asha);

    const moved = await patch(`/api/v1/admin/leads/${a.id}`).send({ stage: "contacted", company: "", role: "Founder" });
    expect(moved.status).toBe(200);
    expect(moved.body.item.stage).toBe("contacted");
    expect(moved.body.item.company).toBe("");
    expect(moved.body.item.role).toBe("Founder");
    const stageActs = moved.body.item.activities.filter((x: { type: string }) => x.type === "stage");
    expect(stageActs).toHaveLength(1);
    expect(stageActs[0].summary).toContain("new → contacted");

    const same = await patch(`/api/v1/admin/leads/${a.id}`).send({ stage: "contacted" });
    expect(same.body.item.activities.filter((x: { type: string }) => x.type === "stage")).toHaveLength(1);

    const unsub = await patch(`/api/v1/admin/leads/${a.id}`).send({ stage: "unsubscribed" });
    expect(unsub.body.item.unsubscribedAt).toBeTruthy();
    const cleared = await patch(`/api/v1/admin/leads/${a.id}`).send({ unsubscribedAt: null, stage: "new" });
    expect(cleared.body.item.unsubscribedAt).toBeNull();

    expect((await patch(`/api/v1/admin/leads/${a.id}`).send({})).status).toBe(400);
    expect((await patch(`/api/v1/admin/leads/${a.id}`).send({ stage: "nope" })).status).toBe(400);
  });

  it("will not strip the last contact detail", async () => {
    const a = await create(asha);
    const res = await patch(`/api/v1/admin/leads/${a.id}`).send({ email: null });
    expect(res.status).toBe(400);
  });

  it("unsets a cleared email instead of storing null, so sparse uniqueness holds", async () => {
    const x = await create({ firstName: "X", email: "x@example.com", phone: "9000000001" });
    const cleared = await patch(`/api/v1/admin/leads/${x.id}`).send({ email: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.item.email).toBeNull();

    const raw = await Lead.collection.findOne({ _id: (await Lead.findById(x.id).exec())!._id });
    expect(raw && "email" in raw).toBe(false);

    // A second email-less lead must not collide on a stored null.
    expect((await post("/api/v1/admin/leads").send({ firstName: "Y", phone: "9000000002" })).status).toBe(201);
  });

  it("adds notes with the author and a timeline entry", async () => {
    const a = await create(asha);
    const res = await post(`/api/v1/admin/leads/${a.id}/notes`).send({ text: "Met at the Jaipur expo." });
    expect(res.status).toBe(200);
    expect(res.body.item.notes).toHaveLength(1);
    expect(res.body.item.notes[0].text).toBe("Met at the Jaipur expo.");
    expect(res.body.item.notes[0].by).toBe("legacy@maplestudios");
    expect(res.body.item.activities.map((x: { type: string }) => x.type)).toContain("note");

    expect((await post(`/api/v1/admin/leads/${a.id}/notes`).send({ text: "" })).status).toBe(400);
  });

  it("deletes a lead", async () => {
    const a = await create(asha);
    expect((await del(`/api/v1/admin/leads/${a.id}`)).body).toEqual({ ok: true });
    expect((await get(`/api/v1/admin/leads/${a.id}`)).status).toBe(404);
    expect((await del(`/api/v1/admin/leads/${a.id}`)).status).toBe(404);
  });

  it("bulk-updates stage, owner and tags", async () => {
    const a = await create(asha);
    const r = await create(ravi);
    const m = await create(meera);

    const res = await post("/api/v1/admin/leads/bulk").send({
      ids: [a.id, r.id],
      set: { stage: "contacted", owner: "aditya" },
      addTags: ["q4"],
      removeTags: ["hotel"],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, updated: 2 });

    const a2 = (await get(`/api/v1/admin/leads/${a.id}`)).body.item;
    expect(a2.stage).toBe("contacted");
    expect(a2.owner).toBe("aditya");
    expect(a2.tags.sort()).toEqual(["q4", "vip"]);
    expect(a2.activities.some((x: { type: string }) => x.type === "stage")).toBe(true);

    const r2 = (await get(`/api/v1/admin/leads/${r.id}`)).body.item;
    expect(r2.tags.sort()).toEqual(["cafe", "q4"]);

    const m2 = (await get(`/api/v1/admin/leads/${m.id}`)).body.item;
    expect(m2.stage).toBe("qualified");
    expect(m2.activities).toHaveLength(0);

    // Already contacted: no second stage activity. Owner cleared with null.
    await post("/api/v1/admin/leads/bulk").send({ ids: [a.id], set: { stage: "contacted", owner: null } });
    const a3 = (await get(`/api/v1/admin/leads/${a.id}`)).body.item;
    expect(a3.activities.filter((x: { type: string }) => x.type === "stage")).toHaveLength(1);
    expect(a3.owner).toBe("");

    expect((await post("/api/v1/admin/leads/bulk").send({ ids: [a.id] })).status).toBe(400);
    expect((await post("/api/v1/admin/leads/bulk").send({ ids: [], set: { stage: "won" } })).status).toBe(400);
  });

  it("exports the filtered list as CSV with custom fields as columns", async () => {
    await create({ ...asha, custom: { linkedin: "https://linkedin.com/in/asha" } });
    await create(ravi);
    await create(meera);

    const res = await get("/api/v1/admin/leads.csv?stage=new");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.charCodeAt(0)).toBe(0xfeff);

    const lines = res.text.slice(1).trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("firstName");
    expect(lines[0]).toContain("custom:linkedin");
    const ashaLine = lines.find((l) => l.includes("asha@example.com"));
    expect(ashaLine).toContain('"hotel, vip"');
    expect(ashaLine).toContain("https://linkedin.com/in/asha");
  });
});

describe("segments", () => {
  it("saves a filter, counts it, edits it and refuses duplicate names", async () => {
    await create(asha);
    await create(ravi);
    await create(meera);

    const created = await post("/api/v1/admin/segments").send({
      name: "Jaipur hotels",
      filter: { city: "Jaipur", tags: ["hotel"], segment: "", stage: [] },
    });
    expect(created.status).toBe(201);
    expect(created.body.item.filter).toEqual({ city: "Jaipur", tags: ["hotel"] });
    const id = created.body.item.id;

    expect((await get(`/api/v1/admin/segments/${id}/count`)).body).toEqual({ count: 1 });
    expect((await get("/api/v1/admin/segments")).body.items).toHaveLength(1);

    const renamed = await patch(`/api/v1/admin/segments/${id}`).send({ name: "Hotels", filter: { tags: ["hotel", "cafe"] } });
    expect(renamed.body.item.name).toBe("Hotels");
    expect(renamed.body.item.filter).toEqual({ tags: ["hotel", "cafe"] });
    expect((await get(`/api/v1/admin/segments/${id}/count`)).body.count).toBe(2);

    expect((await post("/api/v1/admin/segments").send({ name: "Hotels" })).status).toBe(409);
    expect((await post("/api/v1/admin/segments").send({ name: "Bad", filter: { stage: ["nope"] } })).status).toBe(400);

    expect((await del(`/api/v1/admin/segments/${id}`)).body).toEqual({ ok: true });
    expect((await get(`/api/v1/admin/segments/${id}/count`)).status).toBe(404);
  });
});

describe("CSV import", () => {
  const seven = [
    "Name,Email Address,Mobile No.,Organisation,Designation,LinkedIn,Tags",
    ...Array.from({ length: 7 }, (_, i) => `Person ${i},p${i}@example.com,,Co ${i},CEO,https://li/${i},a;b`),
  ].join("\r\n");

  it("previews columns, a sample and a best-guess mapping", async () => {
    const res = await post("/api/v1/admin/leads/import/preview").set("content-type", "text/csv").send(seven);
    expect(res.status).toBe(200);
    expect(res.body.columns).toEqual(["Name", "Email Address", "Mobile No.", "Organisation", "Designation", "LinkedIn", "Tags"]);
    expect(res.body.rows).toBe(7);
    expect(res.body.sample).toHaveLength(5);
    expect(res.body.mapping).toEqual({
      Name: "firstName",
      "Email Address": "email",
      "Mobile No.": "phone",
      Organisation: "company",
      Designation: "role",
      LinkedIn: "custom:LinkedIn",
      Tags: "tags",
    });
  });

  it("rejects anything that is not a text/csv body", async () => {
    expect((await post("/api/v1/admin/leads/import/preview").send({ csv: "a,b" })).status).toBe(400);
    expect((await post("/api/v1/admin/leads/import/preview").set("content-type", "text/csv").send("")).status).toBe(400);
    expect((await importCsv("/api/v1/admin/leads/import", "a,b\n")).status).toBe(400);
  });

  it("guesses sensibly when the same field appears twice", () => {
    expect(leads.guessMapping(["First Name", "Name", "E-mail", "", "custom:score", "Notes"])).toEqual({
      "First Name": "firstName",
      Name: "custom:Name",
      "E-mail": "email",
      "": "ignore",
      "custom:score": "custom:score",
      Notes: "custom:Notes",
    });
  });

  const messy = [
    "Name,Email,Phone,Company,City,Notes",
    "Asha Rao,ASHA@example.com,,Rao Interiors,Jaipur,met at expo",
    "Ravi Kumar,,98765 43210,Ravi Hospitality,Delhi,",
    "Bad Email,not-an-email,,X,,",
    "No Contact,,,Y,,",
    "Bad Phone,,12345,Z,,",
    ",new@example.com,,Nameless Co,,",
    "Ravi Kumar,,+91 98765 43210,Dup Co,,",
  ].join("\n");

  it("imports with dedupe=skip, splitting full names and reporting every invalid row", async () => {
    const existing = await create({ firstName: "Asha", email: "asha@example.com" });

    const res = await importCsv("/api/v1/admin/leads/import", messy, { tags: "expo-2026", source: "expo-sheet" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.batchId).toBeTruthy();
    expect(res.body).toMatchObject({ imported: 1, updated: 0, skipped: 2 });
    expect(res.body.invalid).toEqual([
      { row: 4, reason: 'Invalid email "not-an-email"' },
      { row: 5, reason: "No email or phone" },
      { row: 6, reason: 'Invalid phone "12345"' },
      { row: 7, reason: "Missing name" },
    ]);

    const ravi2 = await Lead.findOne({ phone: "+919876543210" }).exec();
    expect(ravi2?.firstName).toBe("Ravi");
    expect(ravi2?.lastName).toBe("Kumar");
    expect(ravi2?.company).toBe("Ravi Hospitality");
    expect(ravi2?.city).toBe("Delhi");
    expect(ravi2?.source).toBe("expo-sheet");
    expect(ravi2?.tags).toEqual(["expo-2026"]);
    expect(ravi2?.stage).toBe("new");
    expect(ravi2?.importBatchId).toBe(res.body.batchId);
    expect(ravi2?.activities[0]?.type).toBe("import");
    expect(ravi2?.activities[0]?.ref).toBe(res.body.batchId);
    expect(ravi2?.createdAt).toBeInstanceOf(Date);

    // skip means skip: the existing lead was not touched at all.
    const untouched = await Lead.findById(existing.id).exec();
    expect(untouched?.company).toBeUndefined();
    expect(untouched?.importBatchId).toBeUndefined();
    expect(await Lead.countDocuments()).toBe(2);
  });

  it("imports with dedupe=update, filling only empty fields", async () => {
    const existing = await create({ firstName: "Asha", email: "asha@example.com", city: "Udaipur", tags: ["vip"] });
    const csv = [
      "First Name,Last Name,Email,Company,City,Notes",
      "Asha,Rao,asha@example.com,Rao Interiors,Jaipur,met at expo",
      "Priya,Sen,priya@example.com,Sen & Co,Pune,",
    ].join("\n");

    const first = await importCsv("/api/v1/admin/leads/import", csv, { dedupe: "update", tags: "expo-2026" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ imported: 1, updated: 1, skipped: 0, invalid: [] });

    const a = await Lead.findById(existing.id).exec();
    expect(a?.lastName).toBe("Rao");
    expect(a?.company).toBe("Rao Interiors");
    expect(a?.city).toBe("Udaipur"); // never overwritten
    expect(a?.custom.get("Notes")).toBe("met at expo");
    expect(a?.tags.slice().sort()).toEqual(["expo-2026", "vip"]);
    expect(a?.importBatchId).toBe(first.body.batchId);
    const act = a?.activities.find((x) => x.type === "import");
    expect(act?.summary).toContain("company");
    expect(act?.ref).toBe(first.body.batchId);

    // Nothing left to fill: the same file again is a no-op, not a second activity.
    const again = await importCsv("/api/v1/admin/leads/import", csv, { dedupe: "update", tags: "expo-2026" });
    expect(again.body).toMatchObject({ imported: 0, updated: 0, skipped: 2 });
    expect((await Lead.findById(existing.id).exec())?.activities.filter((x) => x.type === "import")).toHaveLength(1);
  });

  it("reports a fill that would collide with another lead instead of failing the batch", async () => {
    await create({ firstName: "A", email: "a@example.com" });
    await create({ firstName: "B", phone: "9000000002" });
    const csv = "Name,Email,Phone\nA Again,a@example.com,9000000002\nC New,c@example.com,\n";

    const res = await importCsv("/api/v1/admin/leads/import", csv, { dedupe: "update" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ imported: 1, updated: 0, skipped: 0 });
    expect(res.body.invalid).toEqual([{ row: 2, reason: "Another lead already has that email or phone" }]);
    expect(await Lead.countDocuments()).toBe(3);
  });

  it("honours an explicit mapping and rejects a broken one", async () => {
    const csv = "Full,Mail,Co,Extra\nAsha Rao,asha@example.com,Rao Interiors,ignored\n";
    const mapping = JSON.stringify({ Full: "firstName", Mail: "email", Co: "ignore", Extra: "custom:Extra" });

    const res = await importCsv("/api/v1/admin/leads/import", csv, { mapping });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ imported: 1 });
    const a = await Lead.findOne({ email: "asha@example.com" }).exec();
    expect(a?.firstName).toBe("Asha");
    expect(a?.lastName).toBe("Rao");
    expect(a?.company).toBeUndefined();
    expect(a?.custom.get("Extra")).toBe("ignored");

    expect((await importCsv("/api/v1/admin/leads/import", csv, { mapping: "{not json" })).status).toBe(400);
    expect((await importCsv("/api/v1/admin/leads/import", csv, { mapping: JSON.stringify({ Full: "nope" }) })).status).toBe(400);
    expect((await importCsv("/api/v1/admin/leads/import", csv, { dedupe: "merge" })).status).toBe(400);
  });
});

describe("service hooks for other modules", () => {
  it("buildLeadQuery translates a filter", () => {
    expect(leads.buildLeadQuery({ stage: ["new"], tags: ["a", "b"], hasEmail: true, hasPhone: false, city: "Jaipur", q: "rao" })).toEqual({
      stage: { $in: ["new"] },
      tags: { $in: ["a", "b"] },
      email: { $nin: [null, ""] },
      phone: { $in: [null, ""] },
      city: "Jaipur",
      $text: { $search: "rao" },
    });
    expect(leads.buildLeadQuery({})).toEqual({});
  });

  it("findLeadsForAudience drops suppressed, unsubscribed and email-less leads", async () => {
    const ok = await Lead.create({ firstName: "Ok", email: "ok@example.com", tags: ["x"] });
    const suppressed = await Lead.create({ firstName: "Sup", email: "sup@example.com", suppressed: true, tags: ["x"] });
    await Lead.create({ firstName: "Unsub", email: "unsub@example.com", stage: "unsubscribed", unsubscribedAt: new Date() });
    await Lead.create({ firstName: "StageOnly", email: "stage@example.com", stage: "unsubscribed" });
    const phoneOnly = await Lead.create({ firstName: "Phone", phone: "+919000000003", tags: ["x"] });
    const segment = await Segment.create({ name: "x", filter: { tags: ["x"] } });

    const emails = (docs: { email?: string }[]) => docs.map((d) => d.email);
    expect(emails(await leads.findLeadsForAudience({ filter: {} }))).toEqual(["ok@example.com"]);
    expect(emails(await leads.findLeadsForAudience({ leadIds: [String(ok._id), String(suppressed._id), String(phoneOnly._id)] }))).toEqual(["ok@example.com"]);
    expect(emails(await leads.findLeadsForAudience({ segmentId: String(segment._id) }))).toEqual(["ok@example.com"]);
    expect(await leads.findLeadsForAudience({ filter: { stage: ["unsubscribed"] } })).toEqual([]);
    expect(await leads.findLeadsForAudience({ filter: { hasEmail: false } })).toEqual([]);
    expect(await leads.findLeadsForAudience({ leadIds: [] })).toEqual([]);
    await expect(leads.findLeadsForAudience({})).rejects.toMatchObject({ statusCode: 400 });
    await expect(leads.findLeadsForAudience({ segmentId: "0123456789abcdef01234567" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("recordActivity appends to the timeline", async () => {
    const lead = await Lead.create({ firstName: "Ok", email: "ok@example.com" });
    expect(await leads.recordActivity(String(lead._id), { type: "email_sent", summary: "Sent step 1", ref: "camp1" })).toBe(true);
    const after = await Lead.findById(lead._id).exec();
    expect(after?.activities).toHaveLength(1);
    expect(after?.activities[0]).toMatchObject({ type: "email_sent", summary: "Sent step 1", ref: "camp1" });
    expect(await leads.recordActivity("0123456789abcdef01234567", { type: "note", summary: "x" })).toBe(false);
  });

  it("markUnsubscribed is idempotent and keeps the first timestamp", async () => {
    const lead = await Lead.create({ firstName: "Ok", email: "ok@example.com", stage: "contacted" });
    const first = await leads.markUnsubscribed(String(lead._id));
    expect(first?.stage).toBe("unsubscribed");
    expect(first?.unsubscribedAt).toBeInstanceOf(Date);
    expect(first?.activities.map((a) => a.type)).toEqual(["stage", "unsubscribed"]);

    const second = await leads.markUnsubscribed(String(lead._id));
    expect(second?.unsubscribedAt?.getTime()).toBe(first?.unsubscribedAt?.getTime());
    expect(second?.activities).toHaveLength(2);
    expect(await leads.markUnsubscribed("0123456789abcdef01234567")).toBeNull();
  });

  it("touchContacted moves a new lead to contacted and never rewinds the timestamp", async () => {
    const fresh = await Lead.create({ firstName: "New", email: "new@example.com" });
    const qualified = await Lead.create({ firstName: "Q", email: "q@example.com", stage: "qualified" });
    const t1 = new Date("2026-10-10T10:00:00Z");
    const t0 = new Date("2026-10-09T10:00:00Z");

    await leads.touchContacted(String(fresh._id), t1);
    let f = await Lead.findById(fresh._id).exec();
    expect(f?.stage).toBe("contacted");
    expect(f?.lastContactedAt?.toISOString()).toBe(t1.toISOString());
    expect(f?.activities.map((a) => a.type)).toEqual(["stage"]);

    await leads.touchContacted(String(fresh._id), t0);
    f = await Lead.findById(fresh._id).exec();
    expect(f?.lastContactedAt?.toISOString()).toBe(t1.toISOString());
    expect(f?.activities).toHaveLength(1);

    await leads.touchContacted(String(qualified._id), t1);
    const q = await Lead.findById(qualified._id).exec();
    expect(q?.stage).toBe("qualified");
    expect(q?.lastContactedAt?.toISOString()).toBe(t1.toISOString());
  });
});
