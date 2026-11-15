import type { Request, RequestHandler } from "express";
import { AppError } from "../../lib/AppError.js";
import { AdminUser } from "../auth/admin.model.js";
import { Employee } from "../team/team.model.js";
import { Project } from "./business.model.js";
import { id } from "./business.schema.js";
export const isManager = (req: Request) =>
  req.admin?.role === "owner" || req.admin?.role === "admin";
export const requireBusinessManager: RequestHandler = (req, _res, next) =>
  isManager(req) ? next() : next(AppError.forbidden());
export const requireBusinessOwner: RequestHandler = (req, _res, next) =>
  req.admin?.role === "owner" ? next() : next(AppError.forbidden());
export const noLegacy: RequestHandler = (req, _res, next) =>
  req.admin?.legacy
    ? next(AppError.forbidden("Use your individual account."))
    : next();
export async function eligiblePeople() {
  const employees = await Employee.find({ status: { $ne: "inactive" } }).select(
    "email",
  );
  return AdminUser.find({
    active: { $ne: false },
    email: { $in: employees.map((e) => e.email) },
  })
    .select("name email role")
    .sort({ name: 1, _id: 1 });
}
export async function validateAssignments(ids: string[]) {
  const allowed = new Set((await eligiblePeople()).map((p) => String(p._id)));
  if (ids.some((i) => !allowed.has(i)))
    throw AppError.badRequest("Choose active teammates with employee records.");
}
export async function memberActive(req: Request) {
  return !!(await Employee.exists({
    email: req.admin?.email,
    status: { $ne: "inactive" },
  }));
}
export async function projectFor(req: Request, projectId: string) {
  const project = await Project.findById(id.parse(projectId));
  if (
    !project ||
    (!isManager(req) &&
      (!project.assigneeIds.includes(req.admin!.id) ||
        !(await memberActive(req))))
  )
    throw AppError.notFound("Project not found.");
  return project;
}
