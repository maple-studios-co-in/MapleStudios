/** RFC 4180: quote everything containing a comma, quote or newline. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[]
): string {
  const head = columns.map(cell).join(",");
  const body = rows.map((r) => columns.map((c) => cell(r[c])).join(",")).join("\n");
  // Leading BOM so Excel opens UTF-8 accents correctly.
  return `\uFEFF${head}\n${body}\n`;
}
