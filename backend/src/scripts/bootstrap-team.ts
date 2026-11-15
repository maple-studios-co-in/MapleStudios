import { readFile } from "node:fs/promises";
import { z } from "zod";
import { connectDb, disconnectDb } from "../config/db.js";
import { AdminUser, hashPassword } from "../modules/auth/admin.model.js";
import { Employee } from "../modules/team/team.model.js";
import mongoose from "mongoose";
import "../routes.js";
const rosterSchema = z
  .array(
    z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().toLowerCase().email(),
        role: z.enum(["owner", "admin", "member"]),
        contractStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        passwordEnv: z.string().regex(/^BOOTSTRAP_[A-Z0-9_]+$/),
      })
      .strict(),
  )
  .min(1);
async function main() {
  if (!process.env.TEAM_BOOTSTRAP_FILE)
    throw new Error(
      "Set TEAM_BOOTSTRAP_FILE to the approved private roster file.",
    );
  const roster = rosterSchema.parse(
    JSON.parse(await readFile(process.env.TEAM_BOOTSTRAP_FILE, "utf8")),
  );
  const passwords = roster.map((p) => process.env[p.passwordEnv]);
  if (
    passwords.some((p) => !p || p.length < 12) ||
    new Set(passwords).size !== passwords.length
  )
    throw new Error(
      "Supply a unique password of at least 12 characters for every roster row through its named environment variable.",
    );
  if (new Set(roster.map((p) => p.email)).size !== roster.length)
    throw new Error("The roster contains duplicate email addresses.");
  await connectDb();
  try {
    await Promise.all(
      Object.values(mongoose.models).map((m) => m.createIndexes()),
    );
    for (const person of roster) {
      const existing = await AdminUser.findOne({ email: person.email });
      if (
        existing &&
        (existing.role !== person.role || existing.active === false)
      )
        throw new Error(
          "An existing account conflicts with the approved roster. Review it with an Owner; no access was changed.",
        );
    }
    for (const person of roster) {
      if (!(await AdminUser.exists({ email: person.email })))
        await AdminUser.create({
          name: person.name,
          email: person.email,
          role: person.role,
          passwordHash: await hashPassword(process.env[person.passwordEnv]!),
        });
      await Employee.updateOne(
        { email: person.email },
        {
          $setOnInsert: {
            name: person.name,
            email: person.email,
            title: "",
            contractStart: person.contractStart,
            contractStatus: "draft",
            contractReference: "",
            status: "onboarding",
            updatedBy: "approved-bootstrap",
          },
        },
        { upsert: true },
      );
    }
    process.stdout.write(
      "Approved accounts and employee records are present. Existing passwords and employee data were preserved. No messages sent.\n",
    );
  } finally {
    await disconnectDb();
  }
}
main().catch(() => {
  console.error(
    "Bootstrap failed. Check the private roster, password variables, existing account roles and database connection. No secrets are logged.",
  );
  process.exitCode = 1;
});
