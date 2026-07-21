import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAuth } = vi.hoisted(() => ({ mockRequireAuth: vi.fn() }));
const { mockGetText, mockDestroy } = vi.hoisted(() => ({
  mockGetText: vi.fn(),
  mockDestroy: vi.fn().mockResolvedValue(undefined),
}));
const { mockMatchCompanyByIsin, mockHasDuplicateTransaction } = vi.hoisted(() => ({
  mockMatchCompanyByIsin: vi.fn(),
  mockHasDuplicateTransaction: vi.fn(),
}));
const { mockCreate, mockAuditCreate, mockTransaction } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mockRequireAuth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn().mockImplementation(function () {
    return { getText: mockGetText, destroy: mockDestroy };
  }),
}));
vi.mock("@/lib/pdf-import-matching", () => ({
  matchCompanyByIsin: mockMatchCompanyByIsin,
  hasDuplicateTransaction: mockHasDuplicateTransaction,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

import { parsePdfStatement, confirmPdfImport } from "@/app/(dashboard)/import-transactions/actions";

const USER = { id: "user1", email: "user1@example.com", role: "USER" };
const COMPANY = { id: "company1", ticker: "BYD", isin: "HK0285041858" };

const STATEMENT_TEXT = [
  "13 mai 2025 Exécution",
  "d'ordre",
  "Buy trade HK0285041858 BYD ELECTRONIC (INTL) CO. LTD., quantity: 50",
  "206,25 € 43,75 €",
].join("\n");

function pdfFormData(bytes = "%PDF-1.4 fake content"): FormData {
  const fd = new FormData();
  const file = new File([bytes], "statement.pdf", { type: "application/pdf" });
  fd.set("file", file);
  return fd;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue(USER);
  mockGetText.mockReset();
  mockDestroy.mockReset().mockResolvedValue(undefined);
  mockMatchCompanyByIsin.mockReset();
  mockHasDuplicateTransaction.mockReset().mockResolvedValue(false);
  mockCreate.mockReset().mockResolvedValue({ id: "new-txn" });
  mockAuditCreate.mockReset();
  mockTransaction.mockReset().mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      transaction: { create: mockCreate },
      auditLog: { create: mockAuditCreate },
    })
  );
});

describe("parsePdfStatement", () => {
  it("rejects a non-PDF file before parsing", async () => {
    const res = await parsePdfStatement(pdfFormData("not a pdf"));
    expect(res).toEqual({ error: "File does not look like a PDF" });
    expect(mockGetText).not.toHaveBeenCalled();
  });

  it("returns a matched, non-duplicate row for a recognized BUY line", async () => {
    mockGetText.mockResolvedValue({ text: STATEMENT_TEXT });
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);
    mockHasDuplicateTransaction.mockResolvedValue(false);

    const res = await parsePdfStatement(pdfFormData());
    if (!("rows" in res)) throw new Error("expected rows");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      unparsed: false,
      date: "2025-05-13",
      type: "BUY",
      isin: "HK0285041858",
      quantity: 50,
      matchedCompanyId: "company1",
      matchedTicker: "BYD",
      isDuplicate: false,
    });
  });

  it("flags a row with no matching company, leaving matchedCompanyId unset", async () => {
    mockGetText.mockResolvedValue({ text: STATEMENT_TEXT });
    mockMatchCompanyByIsin.mockResolvedValue(null);

    const res = await parsePdfStatement(pdfFormData());
    if (!("rows" in res)) throw new Error("expected rows");
    expect(res.rows[0].matchedCompanyId).toBeUndefined();
  });

  it("flags a matched row as a duplicate", async () => {
    mockGetText.mockResolvedValue({ text: STATEMENT_TEXT });
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);
    mockHasDuplicateTransaction.mockResolvedValue(true);

    const res = await parsePdfStatement(pdfFormData());
    if (!("rows" in res)) throw new Error("expected rows");
    expect(res.rows[0].isDuplicate).toBe(true);
  });

  it("returns an error when the statement has no recognizable rows", async () => {
    mockGetText.mockResolvedValue({ text: "nothing to see here" });
    const res = await parsePdfStatement(pdfFormData());
    expect(res).toEqual({ error: "No transactions found in this statement" });
  });

  it("returns an error when the PDF can't be read", async () => {
    mockGetText.mockRejectedValue(new Error("bad PDF"));
    const res = await parsePdfStatement(pdfFormData());
    expect(res).toEqual({
      error: "Could not read PDF — the file may be corrupted or password-protected",
    });
  });
});

describe("confirmPdfImport", () => {
  it("creates a transaction and audit log for a valid matched row", async () => {
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);
    mockHasDuplicateTransaction.mockResolvedValue(false);

    const res = await confirmPdfImport([
      { date: "2025-05-13", type: "BUY", isin: "HK0285041858", quantity: 50, pricePerShare: 4.125 },
    ]);

    expect(res.created).toBe(1);
    expect(res.skipped).toHaveLength(0);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("skips and does not create a row with no matching company", async () => {
    mockMatchCompanyByIsin.mockResolvedValue(null);

    const res = await confirmPdfImport([
      { date: "2025-05-13", type: "BUY", isin: "XX0000000000", quantity: 50, pricePerShare: 4.125 },
    ]);

    expect(res.created).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("skips and does not create a row flagged as a duplicate", async () => {
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);
    mockHasDuplicateTransaction.mockResolvedValue(true);

    const res = await confirmPdfImport([
      { date: "2025-05-13", type: "BUY", isin: "HK0285041858", quantity: 50, pricePerShare: 4.125 },
    ]);

    expect(res.created).toBe(0);
    expect(res.skipped[0].reason).toContain("duplicate");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("skips a row that fails schema validation (e.g. non-positive quantity)", async () => {
    mockMatchCompanyByIsin.mockResolvedValue(COMPANY);

    const res = await confirmPdfImport([
      { date: "2025-05-13", type: "BUY", isin: "HK0285041858", quantity: 0, pricePerShare: 4.125 },
    ]);

    expect(res.created).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
