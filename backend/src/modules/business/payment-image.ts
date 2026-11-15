import { PNG } from "pngjs";

// Bound dimensions before decompression, then decode/re-encode to discard metadata.
export function paymentImage(value: string) {
  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    value.length > 70000
  )
    throw new Error("Upload a PNG QR image smaller than 50 KB after resizing.");
  const data = Buffer.from(
    value.slice("data:image/png;base64,".length),
    "base64",
  );
  if (
    data.length < 33 ||
    data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    data.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new Error("The payment QR image is not a valid PNG.");
  let offset = 8,
    headers = 0,
    ended = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    if (length > data.length - offset - 12)
      throw new Error("Invalid PNG chunk structure.");
    if (type === "IHDR") {
      if (++headers !== 1 || offset !== 8 || length !== 13)
        throw new Error("Invalid PNG header structure.");
    }
    offset += length + 12;
    if (type === "IEND") {
      if (length !== 0 || offset !== data.length)
        throw new Error("Invalid PNG end structure.");
      ended = true;
      break;
    }
  }
  if (headers !== 1 || !ended) throw new Error("Invalid PNG structure.");
  // Canvas produces non-interlaced PNGs. PNGjs's interlaced decoder is unbounded.
  if (data[28] !== 0)
    throw new Error("Interlaced PNG images are not supported.");
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20);
  if (!width || !height || width > 1024 || height > 1024)
    throw new Error("The payment QR image must be at most 1024 × 1024 pixels.");
  const decoded = PNG.sync.read(data, { checkCRC: true });
  const clean = PNG.sync.write(decoded);
  const url = "data:image/png;base64," + clean.toString("base64");
  if (url.length > 70000)
    throw new Error("Use a cropped QR image smaller than 50 KB.");
  return { data: clean, url, width, height };
}
