import { expect, it } from "vitest";
import { importLegacyData } from "../scripts/legacy-import.js";
import { Inquiry } from "../modules/inquiries/inquiry.model.js";
import { Slot } from "../modules/slots/slot.model.js";
const inquiry = {
  id: "old-1",
  at: "2026-01-01T00:00:00Z",
  name: "A",
  email: "a@example.com",
  service: "",
  budget: "",
  message: "Hello",
  status: "replied",
};
const slot = { date: "2099-01-05", time: "10:00", booking: null };
it("preserves legacy records and never overwrites newer Mongo changes on rerun", async () => {
  await importLegacyData({ inquiries: [inquiry], slots: [slot] });
  expect(await Inquiry.countDocuments()).toBe(1);
  expect((await Inquiry.findOne())?.status).toBe("replied");
  await Inquiry.updateOne({}, { $set: { status: "archived" } });
  await Slot.updateOne(
    {},
    {
      $set: {
        booking: {
          name: "New visitor",
          email: "new@example.com",
          at: new Date(),
        },
      },
    },
  );
  await importLegacyData({ inquiries: [inquiry], slots: [slot] });
  expect(await Inquiry.countDocuments()).toBe(1);
  expect((await Inquiry.findOne())?.status).toBe("archived");
  expect((await Slot.findOne())?.booking?.email).toBe("new@example.com");
});
it("validates all source rows before making any changes", async () => {
  await expect(
    importLegacyData({
      inquiries: [inquiry, { ...inquiry, id: "bad", email: "bad" }],
      slots: [slot],
    }),
  ).rejects.toThrow();
  expect(await Inquiry.countDocuments()).toBe(0);
  expect(await Slot.countDocuments()).toBe(0);
});
it("dry run validates records without writing", async () => {
  const result = await importLegacyData(
    { inquiries: [inquiry], slots: [slot] },
    true,
  );
  expect(result).toMatchObject({ inquiries: 1, slots: 1, dryRun: true });
  expect(await Inquiry.countDocuments()).toBe(0);
  expect(await Slot.countDocuments()).toBe(0);
});
