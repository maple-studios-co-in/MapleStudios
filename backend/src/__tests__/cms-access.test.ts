import { expect, it } from "vitest";
import { permitsStudio } from "../../../src/lib/admin/access-policy";
it("blocks encoded owner-only resource names for admins", () => {
  for (const path of [
    "/api/admin/cms/doc/settings",
    "/api/admin/cms/doc/%73ettings",
    "/api/admin/cms/audit",
    "/api/admin/cms/%61udit",
  ])
    expect(permitsStudio("admin", path)).toBe(false);
  expect(permitsStudio("admin", "/api/admin/cms/portfolio")).toBe(true);
});
