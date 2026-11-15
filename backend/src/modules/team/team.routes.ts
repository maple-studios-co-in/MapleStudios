import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { AppError } from "../../lib/AppError.js";
import { Employee, Attendance, Leave, Payroll } from "./team.model.js";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid date.");
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const employeeInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email(),
    title: z.string().trim().max(160).default(""),
    contractStart: date,
    contractStatus: z.enum(["draft", "signed"]).default("draft"),
    contractReference: z.string().trim().max(500).default(""),
    status: z.enum(["onboarding", "active", "inactive"]).default("onboarding"),
  })
  .strict();
const money = z.number().int().min(0).max(1000000000);
const payFields = {
  base: money,
  allowances: money.default(0),
  adjustment: z.number().int().min(-1000000000).max(1000000000).default(0),
  deductions: money.default(0),
  leaveDeduction: money.default(0),
  notes: z.string().trim().max(2000).default(""),
};
const payInput = z
  .object({
    employeeId: id,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    ...payFields,
  })
  .strict();
const payEdit = z.object(payFields).strict();
const netPay = (p: z.infer<typeof payEdit>) => {
  const n =
    p.base + p.allowances + p.adjustment - p.deductions - p.leaveDeduction;
  if (n < 0 || !Number.isSafeInteger(n))
    throw AppError.badRequest("Net pay cannot be negative.");
  return n;
};
const manager = requireRole("owner", "admin");
const owner = requireRole("owner");
export const teamRoutes = Router();
teamRoutes.use(authenticate);
teamRoutes.use((req, _res, next) => {
  if (req.admin?.legacy)
    return next(
      AppError.forbidden("Use an individual account for team records."),
    );
  next();
});
teamRoutes.get("/employees", async (req, res) => {
  const employees = await Employee.find().sort({ name: 1 });
  // The directory is useful to everyone; contracts and status remain manager-only.
  res.json({
    items:
      req.admin?.role === "member"
        ? employees.map((e) => ({
            id: String(e._id),
            name: e.name,
            email: e.email,
            title: e.title,
          }))
        : employees,
  });
});
teamRoutes.post("/employees", manager, async (req, res) => {
  const input = employeeInput.parse(req.body);
  if (input.contractStatus === "signed" && !input.contractReference)
    throw AppError.badRequest("Add the signed contract reference.");
  res
    .status(201)
    .json({
      item: await Employee.create({ ...input, updatedBy: req.admin?.email }),
    });
});
teamRoutes.patch("/employees/:id", manager, async (req, res) => {
  const input = employeeInput.omit({ email: true }).parse(req.body);
  if (input.contractStatus === "signed" && !input.contractReference)
    throw AppError.badRequest("Add the signed contract reference.");
  const item = await Employee.findByIdAndUpdate(
    id.parse(req.params.id),
    { $set: { ...input, updatedBy: req.admin?.email } },
    { new: true },
  );
  if (!item) throw AppError.notFound();
  res.json({ item });
});
async function myEmployee(email?: string) {
  const employee = await Employee.findOne({
    email,
    status: { $ne: "inactive" },
  });
  if (!employee)
    throw AppError.forbidden(
      "Your employee record has not been activated. Ask an administrator.",
    );
  return employee;
}
teamRoutes.get("/attendance", async (req, res) => {
  const period = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(req.query.period);
  const filter: Record<string, unknown> = { date: { $regex: `^${period}-` } };
  if (req.admin?.role === "member")
    filter.employeeId = String((await myEmployee(req.admin.email))._id);
  res.json({ items: await Attendance.find(filter).sort({ date: -1 }) });
});
teamRoutes.post("/attendance", async (req, res) => {
  const input = z
    .object({
      employeeId: id,
      date,
      status: z.enum(["present", "remote", "half-day", "absent", "leave"]),
      note: z.string().max(500).default(""),
    })
    .strict()
    .parse(req.body);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  if (input.date > today)
    throw AppError.badRequest("Attendance cannot be recorded in advance.");
  if (req.admin?.role === "member") {
    if (String((await myEmployee(req.admin.email))._id) !== input.employeeId)
      throw AppError.forbidden();
    if (input.date !== today)
      throw AppError.forbidden(
        "Ask an administrator to correct past attendance.",
      );
  }
  if (
    !(await Employee.exists({
      _id: input.employeeId,
      status: { $ne: "inactive" },
    }))
  )
    throw AppError.notFound("Active employee not found.");
  const item = await Attendance.findOneAndUpdate(
    { employeeId: input.employeeId, date: input.date },
    { $set: { ...input, updatedBy: req.admin?.email } },
    { new: true, upsert: true, runValidators: true },
  );
  res.json({ item });
});
teamRoutes.get("/leave", async (req, res) => {
  const filter =
    req.admin?.role === "member"
      ? { employeeId: String((await myEmployee(req.admin.email))._id) }
      : {};
  res.json({ items: await Leave.find(filter).sort({ createdAt: -1 }) });
});
teamRoutes.post("/leave", async (req, res) => {
  const input = z
    .object({
      start: date,
      end: date,
      days: z.number().positive().max(90).multipleOf(0.5),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict()
    .parse(req.body);
  if (
    input.start > input.end ||
    input.days >
      (Date.parse(input.end) - Date.parse(input.start)) / 86400000 + 1
  )
    throw AppError.badRequest("Check the dates and number of working days.");
  const employee = await myEmployee(req.admin?.email);
  res
    .status(201)
    .json({
      item: await Leave.create({
        ...input,
        employeeId: String(employee._id),
        requestedBy: req.admin?.email,
      }),
    });
});
teamRoutes.post("/leave/:id/review", manager, async (req, res) => {
  const leaveId = id.parse(req.params.id);
  const { status } = z
    .object({ status: z.enum(["approved", "rejected"]) })
    .parse(req.body);
  const existing = await Leave.findById(leaveId);
  if (!existing) throw AppError.notFound();
  if (existing.requestedBy === req.admin?.email)
    throw AppError.forbidden("Another administrator must review your leave.");
  const item = await Leave.findOneAndUpdate(
    { _id: leaveId, status: "pending" },
    { $set: { status, reviewedBy: req.admin?.email, reviewedAt: new Date() } },
    { new: true },
  );
  if (!item) throw AppError.conflict("This request has already been reviewed.");
  res.json({ item });
});
teamRoutes.get("/payroll", owner, async (req, res) => {
  const filter = req.query.period
    ? {
        period: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
          .parse(req.query.period),
      }
    : {};
  res.json({
    items: await Payroll.find(filter).sort({ period: -1, employeeName: 1 }),
  });
});
teamRoutes.post("/payroll", owner, async (req, res) => {
  const input = payInput.parse(req.body);
  const employee = await Employee.findById(input.employeeId);
  if (!employee) throw AppError.notFound("Employee not found.");
  if (input.period < String(employee.contractStart).slice(0, 7))
    throw AppError.badRequest("Payroll period precedes the contract start.");
  res
    .status(201)
    .json({
      item: await Payroll.create({
        ...input,
        employeeName: employee.name,
        net: netPay(input),
        history: [
          { action: "created", actor: req.admin?.email, at: new Date() },
        ],
      }),
    });
});
teamRoutes.patch("/payroll/:id", owner, async (req, res) => {
  const payrollId = id.parse(req.params.id);
  const existing = await Payroll.findById(payrollId);
  if (!existing) throw AppError.notFound();
  if (existing.status !== "draft")
    throw AppError.conflict("Approved payroll is locked.");
  const { revision, ...input } = payEdit
    .extend({ revision: z.number().int().nonnegative() })
    .parse(req.body);
  const item = await Payroll.findOneAndUpdate(
    { _id: payrollId, status: "draft", revision },
    {
      $set: { ...input, net: netPay(input) },
      $inc: { revision: 1 },
      $push: {
        history: { action: "updated", actor: req.admin?.email, at: new Date() },
      },
    },
    { new: true },
  );
  if (!item)
    throw AppError.conflict(
      "This draft changed or was approved. Refresh before continuing.",
    );
  res.json({ item });
});
teamRoutes.post("/payroll/:id/:action", owner, async (req, res) => {
  const payrollId = id.parse(req.params.id);
  const action = z.enum(["approve", "paid"]).parse(req.params.action);
  const revision =
    action === "approve"
      ? z.object({ revision: z.number().int().nonnegative() }).parse(req.body)
          .revision
      : undefined;
  const reference =
    action === "paid"
      ? z
          .object({ reference: z.string().trim().min(1).max(200) })
          .parse(req.body).reference
      : undefined;
  const item = await Payroll.findOneAndUpdate(
    {
      _id: payrollId,
      status: action === "approve" ? "draft" : "approved",
      ...(revision !== undefined ? { revision } : {}),
    },
    {
      $set: {
        status: action === "approve" ? "approved" : "paid",
        ...(reference ? { paymentReference: reference } : {}),
      },
      $push: { history: { action, actor: req.admin?.email, at: new Date() } },
    },
    { new: true },
  );
  if (!item)
    throw AppError.conflict(
      "Payroll is no longer in the required state. Refresh and review it.",
    );
  res.json({ item });
});
