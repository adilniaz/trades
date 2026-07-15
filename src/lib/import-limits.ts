// Admin-facing bulk CSV import tools (bulkImportCompanies, bulkImportTransactions)
// process pasted text with no size bound, sequentially (one prisma.$transaction
// per row). These limits are generous for legitimate use — a real company or
// transaction CSV rarely nears them — while bounding worst-case sequential
// DB work from an oversized paste.
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Pure guard, checked before any DB work. `dataRowCount` excludes the header
 * row (if present) — callers pass the count of rows that will actually be
 * processed.
 */
export function checkImportSize(csvText: string, dataRowCount: number): string | null {
  const byteLength = Buffer.byteLength(csvText, "utf8");
  if (byteLength > MAX_IMPORT_BYTES) {
    return `CSV too large: ${(byteLength / (1024 * 1024)).toFixed(1)}MB exceeds the ${MAX_IMPORT_BYTES / (1024 * 1024)}MB limit`;
  }
  if (dataRowCount > MAX_IMPORT_ROWS) {
    return `Too many rows: ${dataRowCount} exceeds the ${MAX_IMPORT_ROWS}-row limit`;
  }
  return null;
}
