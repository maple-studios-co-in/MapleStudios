import request from "supertest";
import { beforeEach, expect, it } from "vitest";
import { createApp } from "../app.js";
import { AdminUser } from "../modules/auth/admin.model.js";
import { signAccessToken } from "../middleware/auth.js";
const app = createApp();
let owner: string, admin: string, member: string;
beforeEach(async () => {
  for (const role of ["owner", "admin", "member"] as const) {
    const account = await AdminUser.create({
      email: `${role}@example.com`,
      name: role,
      role,
      passwordHash: "unused-test",
    });
    const token = signAccessToken({
      sub: account.id,
      email: account.email,
      role,
      ver: 0,
    });
    if (role === "owner") owner = token;
    else if (role === "admin") admin = token;
    else member = token;
  }
});
const call = (method: "get" | "post" | "patch", path: string, token: string) =>
  request(app)[method](`/api/v1/team${path}`).auth(token, { type: "bearer" });
async function employee(email = "member@example.com") {
  const res = await call("post", "/employees", owner).send({
    name: "Team member",
    email,
    title: "Developer",
    contractStart: "2026-12-01",
  });
  expect(res.status).toBe(201);
  return res.body.item.id;
}
it("requires individual authentication and separates personnel from payroll access", async () => {
  expect((await request(app).get("/api/v1/team/employees")).status).toBe(401);
  await employee();
  expect((await call("get", "/employees", member)).status).toBe(200);
  expect((await call("post", "/employees", member).send({})).status).toBe(403);
  expect((await call("get", "/payroll", admin)).status).toBe(403);
  expect((await call("get", "/payroll", member)).status).toBe(403);
});
it("locks approved payroll, records actors, and requires a payment reference", async () => {
  const employeeId = await employee();
  const draft = await call("post", "/payroll", owner).send({
    employeeId,
    period: "2026-12",
    base: 5000000,
    allowances: 100000,
    adjustment: 0,
    deductions: 50000,
    leaveDeduction: 100000,
    notes: "December",
  });
  expect(draft.status).toBe(201);
  expect(draft.body.item.net).toBe(4950000);
  const id = draft.body.item.id;
  expect(
    (
      await call("post", `/payroll/${id}/paid`, owner).send({
        reference: "bank-ref",
      })
    ).status,
  ).toBe(409);
  expect(
    (await call("post", `/payroll/${id}/approve`, owner).send({ revision: 0 }))
      .status,
  ).toBe(200);
  expect(
    (await call("patch", `/payroll/${id}`, owner).send({ base: 1 })).status,
  ).toBe(409);
  expect(
    (await call("post", `/payroll/${id}/paid`, owner).send({})).status,
  ).toBe(400);
  const paid = await call("post", `/payroll/${id}/paid`, owner).send({
    reference: "bank-ref",
  });
  expect(paid.status).toBe(200);
  expect(paid.body.item.status).toBe("paid");
  expect(paid.body.item.history.map((h: { actor: string }) => h.actor)).toEqual(
    ["owner@example.com", "owner@example.com", "owner@example.com"],
  );
  expect(
    (
      await call("post", `/payroll/${id}/paid`, owner).send({
        reference: "again",
      })
    ).status,
  ).toBe(409);
});
it("rejects invalid money and duplicate employee-month payrolls", async () => {
  const employeeId = await employee();
  expect(
    (
      await call("post", "/payroll", owner).send({
        employeeId,
        period: "2026-12",
        base: -1,
      })
    ).status,
  ).toBe(400);
  const input = { employeeId, period: "2026-12", base: 100 };
  const results = await Promise.all([
    call("post", "/payroll", owner).send(input),
    call("post", "/payroll", owner).send(input),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
});
it("members can only record their own attendance and see their own leave", async () => {
  const own = await employee();
  const other = await employee("other@example.com");
  const day = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  expect(
    (
      await call("post", "/attendance", member).send({
        employeeId: other,
        date: day,
        status: "present",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("post", "/attendance", member).send({
        employeeId: own,
        date: day,
        status: "present",
      })
    ).status,
  ).toBe(200);
  const leave = await call("post", "/leave", member).send({
    start: "2026-12-03",
    end: "2026-12-04",
    days: 2,
    reason: "Personal",
  });
  expect(leave.status).toBe(201);
  expect(
    (
      await call("post", `/leave/${leave.body.item.id}/review`, member).send({
        status: "approved",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("post", `/leave/${leave.body.item.id}/review`, admin).send({
        status: "approved",
      })
    ).status,
  ).toBe(200);
  expect((await call("get", "/leave", member)).body.items).toHaveLength(1);
});

it("edits the loaded employee without submitting server-managed metadata", async () => {
  await employee();
  const listed = await call("get", "/employees", owner);
  const row = listed.body.items[0];
  const { employeeEditFields } = await import(
    "../../../src/lib/admin/employee-form"
  );
  const result = await call("patch", `/employees/${row.id}`, owner).send(
    employeeEditFields({ ...row, title: "Updated developer" }),
  );
  expect(result.status).toBe(200);
  expect(result.body.item.title).toBe("Updated developer");
});
it("rejects approval from a stale payroll view", async () => {
  const employeeId = await employee();
  const draft = await call("post", "/payroll", owner).send({
    employeeId,
    period: "2026-12",
    base: 5000000,
  });
  const payrollId = draft.body.item.id;
  const updated = await call("patch", `/payroll/${payrollId}`, owner).send({
    base: 7000000,
    revision: 0,
  });
  expect(updated.status).toBe(200);
  const stale = await call("post", `/payroll/${payrollId}/approve`, owner).send(
    { revision: 0 },
  );
  expect(stale.status).toBe(409);
  const approved = await call(
    "post",
    `/payroll/${payrollId}/approve`,
    owner,
  ).send({ revision: 1 });
  expect(approved.status).toBe(200);
  expect(approved.body.item.net).toBe(7000000);
});

it("serializes concurrent payroll edit and approval against the reviewed revision",async()=>{
  const employeeId=await employee();
  const draft=await call("post","/payroll",owner).send({employeeId,period:"2026-12",base:5000000});
  const path=`/payroll/${draft.body.item.id}`;
  const results=await Promise.all([
    call("patch",path,owner).send({base:7000000,revision:0}),
    call("post",`${path}/approve`,owner).send({revision:0}),
  ]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
});
