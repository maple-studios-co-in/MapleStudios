import { expect, it } from "vitest";
import { PNG } from "pngjs";
import { paymentImage } from "../modules/business/payment-image.js";
const url = (b: Buffer) => "data:image/png;base64," + b.toString("base64");
it("rejects a second IHDR before decoding it with unbounded dimensions", () => {
  const small = PNG.sync.write({ width: 1, height: 1, data: Buffer.alloc(4) });
  const large = PNG.sync.write({
    width: 2048,
    height: 1,
    data: Buffer.alloc(2048 * 4),
  });
  const crafted = Buffer.concat([
    large.subarray(0, 8),
    small.subarray(8, 33),
    large.subarray(8),
  ]);
  expect(() => paymentImage(url(crafted))).toThrow(/structure|header/i);
});
it("rejects interlaced input before PNGjs can run its unbounded inflater", () => {
  const image = PNG.sync.write({ width: 1, height: 1, data: Buffer.alloc(4) });
  image[28] = 1;
  // The preflight must reject interlacing before even attempting CRC/decode.
  expect(() => paymentImage(url(image))).toThrow(/interlac/i);
});
