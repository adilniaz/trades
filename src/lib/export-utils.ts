/**
 * Escapes a field for CSV and neutralizes formula injection.
 *
 * These are two DIFFERENT mechanisms, easy to conflate:
 * - CSV escaping (wrap in quotes, double internal quotes) protects the
 *   *file's row/column structure* from a value containing a comma, quote,
 *   or newline. It is stripped by the CSV parser before the value ever
 *   reaches a spreadsheet's cell-content interpreter.
 * - Formula-injection neutralization protects the *cell content itself*
 *   from being evaluated as a formula once opened in Excel/Sheets/etc. A
 *   value like `=SUM(A1)` is still a live formula whether or not it's
 *   CSV-quoted — quoting alone does NOT prevent this (an earlier version of
 *   this function claimed it did; it didn't, see analysis.md 2a). The real,
 *   OWASP-recommended fix is prefixing the *content* with a literal
 *   apostrophe before a leading =, +, -, @, tab, or CR — spreadsheet apps
 *   treat a leading apostrophe as a "force text" marker that survives CSV
 *   parsing and disables formula evaluation for that cell.
 *
 * Exploitability this closes: Company.name can come from an unsanitized
 * user-submitted company request (Session 8's requestCompany) and flows
 * directly into every user's CSV export via t.company.name below.
 */
export function toCsvField(value: string | number | null): string {
  if (value === null) return "";
  let str = String(value);

  // Formula-injection guard: trim leading whitespace in check — spreadsheet
  // apps ignore leading whitespace before evaluating formulas, so " =SUM(A1)"
  // would bypass a bare ^ regex but still execute.
  if (/^\s*[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }

  const needsEscaping = /[",\n]/.test(str);
  if (!needsEscaping) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(toCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(toCsvField).join(","));
  }
  return lines.join("\n");
}
