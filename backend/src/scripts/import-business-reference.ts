import { readFile } from "node:fs/promises";
import { z } from "zod";
import { connectDb, disconnectDb } from "../config/db.js";
import {
  BusinessCompany,
  BusinessTemplate,
  BusinessDraft,
} from "../modules/business/documents.model.js";
import {
  Client,
  Project,
  Deliverable,
} from "../modules/business/business.model.js";
import { companyInput } from "../modules/business/documents.schema.js";
const referenceInput = z
  .object({
    company: companyInput,
    template: z.object({
      name: z.string().min(1).max(160),
      body: z.string().min(1).max(40000),
      subject: z.string().max(300),
    }),
  })
  .strict();
async function main() {
  if (!process.env.BUSINESS_REFERENCE_FILE)
    throw new Error("Private reference path required.");
  const reference = referenceInput.parse(
    JSON.parse(await readFile(process.env.BUSINESS_REFERENCE_FILE, "utf8")),
  );
  await connectDb();
  try {
    await Promise.all(
      [
        BusinessCompany,
        BusinessTemplate,
        BusinessDraft,
        Client,
        Project,
        Deliverable,
      ].map((m) => m.createIndexes()),
    );
    // Insert only: a rerun must not overwrite settings or an Owner's review.
    await BusinessCompany.updateOne(
      { _id: "company" },
      {
        $setOnInsert: {
          profile: reference.company,
          revision: 1,
          updatedBy: "approved-reference-import",
        },
      },
      { upsert: true },
    );
    await BusinessTemplate.updateOne(
      { name: reference.template.name, kind: "confidentiality" },
      {
        $setOnInsert: {
          ...reference.template,
          kind: "confidentiality",
          status: "draft",
          revision: 0,
          versions: [],
          updatedBy: "approved-reference-import",
        },
      },
      { upsert: true },
    );
    process.stdout.write(
      "Company reference and unpublished agreement are present. Existing settings preserved. No clients, projects or messages created.\n",
    );
  } finally {
    await disconnectDb();
  }
}
main().catch(() => {
  console.error(
    "Reference import failed. Check the private input and database connection; no private values logged.",
  );
  process.exitCode = 1;
});
