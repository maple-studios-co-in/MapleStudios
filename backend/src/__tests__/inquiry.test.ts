import request from "supertest";
import { describe, it, expect } from "vitest";
import { createApp } from "../app.js";
import { Inquiry } from "../modules/inquiries/inquiry.model.js";

const app = createApp();

const valid = {
  name: "Asha Rao",
  email: "Asha@Example.com",
  company: "Rao Interiors",
  service: "AI and Intelligent Automation",
  budget: "5L - 10L",
  message: "We would like a configurator for our catalogue.",
};

describe("POST /api/v1/inquiries", () => {
  it("stores an inquiry and normalises the email", async () => {
    const res = await request(app).post("/api/v1/inquiries").send(valid);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    const saved = await Inquiry.findById(res.body.id).exec();
    expect(saved?.email).toBe("asha@example.com");
    expect(saved?.status).toBe("new");
  });

  it("rejects a bad email with field-level detail", async () => {
    const res = await request(app)
      .post("/api/v1/inquiries")
      .send({ ...valid, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe("email");
  });

  it("strips mongo operators from the body", async () => {
    const res = await request(app)
      .post("/api/v1/inquiries")
      .send({ ...valid, $where: "1 == 1" });
    expect(res.status).toBe(201);
  });

  it("requires auth on the admin inbox", async () => {
    const res = await request(app).get("/api/v1/admin/inquiries");
    expect(res.status).toBe(401);
  });
});
