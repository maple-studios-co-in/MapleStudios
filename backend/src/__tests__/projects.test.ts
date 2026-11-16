import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { AdminUser } from "../modules/auth/admin.model.js";
import { Employee } from "../modules/team/team.model.js";
import { signAccessToken } from "../middleware/auth.js";
const app = createApp(),
  root = "/api/v1/business";
const ids = {
  owner: "100000000000000000000001",
  member: "100000000000000000000002",
  other: "100000000000000000000003",
};
const headers = (who: keyof typeof ids) => ({
  authorization: `Bearer ${signAccessToken({ sub: ids[who], email: `${who}@example.com`, role: who === "owner" ? "owner" : "member", ver: 1 })}`,
});
beforeEach(async () => {
  for (const who of Object.keys(ids) as (keyof typeof ids)[]) {
    await AdminUser.create({
      _id: ids[who],
      name: who,
      email: `${who}@example.com`,
      role: who === "owner" ? "owner" : "member",
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
async function project() {
  const c = await request(app)
    .post(root + "/clients")
    .set(headers("owner"))
    .send({
      name: "Example client",
      contactName: "Sam",
      email: "sam@example.com",
      billingAddress: "Private billing address",
      notes: "Private notes",
    });
  expect(c.status).toBe(201);
  const p = await request(app)
    .post(root + "/projects")
    .set(headers("owner"))
    .send({
      clientId: c.body.item.id,
      title: "New website",
      scope: "Design and build",
      startDate: "2026-12-01",
      dueDate: "2026-12-31",
      assigneeIds: [ids.member],
    });
  expect(p.status).toBe(201);
  return p.body.item;
}
async function deliverable() {
  const p = await project();
  const d = await request(app)
    .post(`${root}/projects/${p.id}/deliverables`)
    .set(headers("owner"))
    .send({
      title: "Homepage",
      description: "Approved scope",
      assigneeId: ids.member,
      dueDate: "2026-12-15",
    });
  expect(d.status).toBe(201);
  return { p, d: d.body.item };
}
describe("business project workspace", () => {
  it("requires individual accounts", async () => {
    expect((await request(app).get(root + "/projects")).status).toBe(401);
  });
  it("creates clients/projects and filters member access without private client fields", async () => {
    const p = await project();
    const list = await request(app)
      .get(root + "/projects")
      .set(headers("member"));
    expect(list.status).toBe(200);
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([p.id]);
    expect(JSON.stringify(list.body)).not.toMatch(
      /Private billing|Private notes|sam@example/,
    );
    expect(
      (
        await request(app)
          .get(root + "/clients")
          .set(headers("member"))
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get(`${root}/projects/${p.id}`).set(headers("other")))
        .status,
    ).toBe(404);
  });
  it("rejects impossible dates, unknown clients and inactive assignments", async () => {
    const p = await project();
    for (const patch of [
      { dueDate: "2026-02-30" },
      { startDate: "2027-01-01" },
      { assigneeIds: ["100000000000000000000099"] },
    ])
      expect(
        (
          await request(app)
            .patch(`${root}/projects/${p.id}`)
            .set(headers("owner"))
            .send({ ...patch, revision: 0 })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .post(root + "/projects")
          .set(headers("owner"))
          .send({
            clientId: "100000000000000000000099",
            title: "Missing",
            startDate: "2026-12-01",
            dueDate: "2026-12-31",
            assigneeIds: [],
          })
      ).status,
    ).toBe(400);
    await Employee.updateOne(
      { email: "member@example.com" },
      { $set: { status: "inactive" } },
    );
    expect(
      (
        await request(app)
          .patch(`${root}/projects/${p.id}`)
          .set(headers("owner"))
          .send({ assigneeIds: [ids.member], revision: 0 })
      ).status,
    ).toBe(400);
  });
  it("uses revisions and revokes project access after removal", async () => {
    const p = await project();
    const changed = await request(app)
      .patch(`${root}/projects/${p.id}`)
      .set(headers("owner"))
      .send({ revision: 0, assigneeIds: [] });
    expect(changed.status).toBe(200);
    expect(changed.body.item.revision).toBe(1);
    expect(
      (
        await request(app)
          .patch(`${root}/projects/${p.id}`)
          .set(headers("owner"))
          .send({ revision: 0, title: "Stale" })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .get(`${root}/projects/${p.id}`)
          .set(headers("member"))
      ).status,
    ).toBe(404);
  });
  it("members update progress only on their own assigned deliverables", async () => {
    const { d } = await deliverable();
    expect(
      (
        await request(app)
          .patch(`${root}/deliverables/${d.id}`)
          .set(headers("member"))
          .send({ revision: 0, dueDate: "2027-01-01" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch(`${root}/deliverables/${d.id}`)
          .set(headers("other"))
          .send({ revision: 0, status: "in-progress" })
      ).status,
    ).toBe(404);
    const r = await request(app)
      .patch(`${root}/deliverables/${d.id}`)
      .set(headers("member"))
      .send({ revision: 0, status: "in-progress", note: "Working on design" });
    expect(r.status).toBe(200);
    expect(r.body.item.status).toBe("in-progress");
  });
  it("requires submission evidence and ties client decisions to the current version", async () => {
    const { d } = await deliverable();
    expect(
      (
        await request(app)
          .patch(`${root}/deliverables/${d.id}`)
          .set(headers("member"))
          .send({ revision: 0, status: "in-review" })
      ).status,
    ).toBe(400);
    const submitted = await request(app)
      .patch(`${root}/deliverables/${d.id}`)
      .set(headers("member"))
      .send({
        revision: 0,
        status: "in-review",
        submissionReference: "https://example.com/review/v1",
      });
    expect(submitted.status).toBe(200);
    expect(submitted.body.item.submissionVersion).toBe(1);
    const decision = {
      revision: 1,
      submissionVersion: 1,
      decision: "approved",
      approverName: "Sam",
      decisionDate: "2026-01-01",
      evidenceReference: "Client email thread 123",
    };
    expect(
      (
        await request(app)
          .post(`${root}/deliverables/${d.id}/decision`)
          .set(headers("member"))
          .send(decision)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`${root}/deliverables/${d.id}/decision`)
          .set(headers("owner"))
          .send({ ...decision, submissionVersion: 0 })
      ).status,
    ).toBe(409);
    const approved = await request(app)
      .post(`${root}/deliverables/${d.id}/decision`)
      .set(headers("owner"))
      .send(decision);
    expect(approved.status).toBe(200);
    expect(approved.body.item.status).toBe("approved");
    expect(approved.body.item.history.at(-1).evidenceReference).toBe(
      "Client email thread 123",
    );
    const edit = await request(app)
      .patch(`${root}/deliverables/${d.id}`)
      .set(headers("owner"))
      .send({ revision: 2, description: "Changed scope" });
    expect(edit.status).toBe(200);
    expect(edit.body.item.status).toBe("in-progress");
    expect(edit.body.item.currentApproval).toBeNull();
    expect(
      edit.body.item.history.some(
        (h: { action: string }) => h.action === "approved",
      ),
    ).toBe(true);
  });
  it("rejects unsafe submission links and prevents approving non-submitted work", async () => {
    const { d } = await deliverable();
    expect(
      (
        await request(app)
          .patch(`${root}/deliverables/${d.id}`)
          .set(headers("member"))
          .send({
            revision: 0,
            status: "in-review",
            submissionReference: "javascript:alert(1)",
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`${root}/deliverables/${d.id}/decision`)
          .set(headers("owner"))
          .send({
            revision: 0,
            submissionVersion: 0,
            decision: "approved",
            approverName: "Sam",
            decisionDate: "2026-01-01",
            evidenceReference: "email",
          })
      ).status,
    ).toBe(409);
  });
  it("archives a client without deleting its project and blocks new work for it", async () => {
    const p = await project();
    const r = await request(app)
      .patch(`${root}/clients/${p.clientId}`)
      .set(headers("owner"))
      .send({ revision: 0, status: "archived" });
    expect(r.status).toBe(200);
    expect(
      (await request(app).get(`${root}/projects/${p.id}`).set(headers("owner")))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(root + "/projects")
          .set(headers("owner"))
          .send({
            clientId: p.clientId,
            title: "New",
            startDate: "2026-12-01",
            dueDate: "2026-12-31",
            assigneeIds: [],
          })
      ).status,
    ).toBe(400);
  });
});

it("preserves project assignments and deliverable scope across title-only edits", async () => {
  const { p, d } = await deliverable();
  const change = await request(app).patch(`${root}/projects/${p.id}`).set(headers("owner")).send({ revision: 0, title: "New title" });
  expect(change.status).toBe(200);
  expect(change.body.item.assigneeIds).toContain(ids.member);
  expect(change.body.item.scope).toBe("Design and build");
  const edit = await request(app).patch(`${root}/deliverables/${d.id}`).set(headers("owner")).send({ revision: 0, title: "New deliverable title" });
  expect(edit.status).toBe(200);
  expect(edit.body.item.assigneeId).toBe(ids.member);
  expect(edit.body.item.description).toBe("Approved scope");
});
