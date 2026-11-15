import request from "supertest";
import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { AdminUser, hashPassword } from "../modules/auth/admin.model.js";

const app = createApp();
const creds = { email: "owner@maplestudios.co.in", password: "a-long-enough-password" };

beforeEach(async () => {
  await AdminUser.create({
    email: creds.email,
    name: "Owner",
    role: "owner",
    passwordHash: await hashPassword(creds.password),
  });
});

describe("auth", () => {
  it("issues a token and accepts it on an admin route", async () => {
    const login = await request(app).post("/api/v1/auth/login").send(creds);
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.admin.passwordHash).toBeUndefined();

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("authorization", `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.admin.email).toBe(creds.email);
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const wrongPw = await request(app)
      .post("/api/v1/auth/login")
      .send({ ...creds, password: "wrong-password-here" });
    const unknown = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password-here" });

    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error).toBe(unknown.body.error);
  });

  it("refuses a garbage bearer token", async () => {
    const res = await request(app)
      .get("/api/v1/admin/summary")
      .set("authorization", "Bearer not.a.token");
    expect(res.status).toBe(401);
  });

  it("returns the dashboard summary to an authenticated admin", async () => {
    const login = await request(app).post("/api/v1/auth/login").send(creds);
    const res = await request(app)
      .get("/api/v1/admin/summary")
      .set("authorization", `Bearer ${login.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.inquiries.total).toBe(0);
    expect(res.body.calls.open).toBe(0);
    expect(res.body.activity).toEqual([]);
  });
});

it("rejects refresh tokens at protected endpoints", async () => {
  const session = await request(app).post("/api/v1/auth/login").send(creds);
  const result = await request(app).get("/api/v1/admin/summary").auth(session.body.refreshToken,{type:"bearer"});
  expect(result.status).toBe(401);
});
it("revokes existing access immediately", async () => {
  const session = await request(app).post("/api/v1/auth/login").send(creds);
  await AdminUser.updateOne({email:creds.email},{$inc:{tokenVersion:1}});
  expect((await request(app).get("/api/v1/auth/me").auth(session.body.token,{type:"bearer"})).status).toBe(401);
});
it("disabled accounts cannot log in or use previously issued sessions", async () => {
  const session = await request(app).post("/api/v1/auth/login").send(creds);
  await AdminUser.collection.updateOne({email:creds.email},{$set:{active:false}});
  expect((await request(app).post("/api/v1/auth/login").send(creds)).status).toBe(401);
  expect((await request(app).get("/api/v1/auth/me").auth(session.body.token,{type:"bearer"})).status).toBe(401);
});
it("members can identify themselves but cannot access studio or account administration", async () => {
  await AdminUser.collection.updateOne({email:creds.email},{$set:{role:"member"}});
  const session = await request(app).post("/api/v1/auth/login").send(creds);
  expect((await request(app).get("/api/v1/auth/me").auth(session.body.token,{type:"bearer"})).status).toBe(200);
  expect((await request(app).get("/api/v1/admin/inquiries").auth(session.body.token,{type:"bearer"})).status).toBe(403);
  expect((await request(app).get("/api/v1/auth/admins").auth(session.body.token,{type:"bearer"})).status).toBe(403);
});
it("owner can disable another account but cannot disable themselves", async () => {
  const session = await request(app).post("/api/v1/auth/login").send(creds);
  const other = await AdminUser.create({email:"other@example.com",name:"Other",role:"admin",passwordHash:await hashPassword(creds.password)});
  const result = await request(app).patch(`/api/v1/auth/admins/${other.id}`).auth(session.body.token,{type:"bearer"}).send({active:false});
  expect(result.status).toBe(200);
  expect(result.body.admin.active).toBe(false);
  expect((await request(app).patch(`/api/v1/auth/admins/${session.body.admin.id}`).auth(session.body.token,{type:"bearer"}).send({active:false})).status).toBe(409);
});
