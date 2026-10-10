/**
 * RFC 4180, hand-rolled because the spec forbids a dependency for it.
 * Handles quoted fields with embedded commas, newlines and doubled quotes,
 * CRLF or LF line ends, a UTF-8 BOM and a trailing newline. Blank lines are
 * dropped - spreadsheets love to append them and they are never data.
 */
export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const records = parseRecords(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const [first, ...rows] = records;
  return { header: (first ?? []).map((h) => h.trim()), rows };
}

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endRow = () => {
    row.push(field);
    field = "";
    if (row.some((cell) => cell !== "")) records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);

    if (quoted) {
      if (ch !== '"') {
        field += ch;
      } else if (text.charAt(i + 1) === '"') {
        field += '"'; // "" inside quotes is a literal quote
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    // A quote only opens a quoted field at the field's start; mid-field it is
    // just a character (5" screens), which keeps one stray inch mark from
    // swallowing the rest of the file.
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text.charAt(i + 1) === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
  }

  // A file without a trailing newline still has its last record pending.
  if (field !== "" || row.length > 0) endRow();
  return records;
}
