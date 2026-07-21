'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  parsePdfStatement,
  confirmPdfImport,
  type PdfReviewRow,
  type ImportResult,
} from './actions';

type EditableRow = PdfReviewRow & { checked: boolean };

export function PdfImportPanel() {
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setParseError(null);
    setResult(null);
    const formData = new FormData();
    formData.set('file', file);
    startTransition(async () => {
      const res = await parsePdfStatement(formData);
      if ('error' in res) {
        setParseError(res.error);
        setRows(null);
        return;
      }
      setRows(
        res.rows.map((r) => ({
          ...r,
          checked: !r.unparsed && !r.isDuplicate && !!r.matchedCompanyId,
        }))
      );
    });
  };

  const updateRow = (id: string, patch: Partial<EditableRow>) => {
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev));
  };

  const handleConfirm = () => {
    if (!rows) return;
    const toImport = rows.filter(
      (r) => r.checked && !r.unparsed && r.date && r.type && r.isin
    );
    startTransition(async () => {
      const res = await confirmPdfImport(
        toImport.map((r) => ({
          date: r.date!,
          type: r.type!,
          isin: r.isin!,
          quantity: r.quantity!,
          pricePerShare: r.pricePerShare!,
        }))
      );
      setResult(res);
      setRows(null);
    });
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="application/pdf"
        disabled={isPending}
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />

      {parseError && <p className="text-sm text-destructive">{parseError}</p>}

      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th></th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Company</th>
                  <th>Qty</th>
                  <th>Price/share</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td>
                      <input
                        type="checkbox"
                        checked={r.checked}
                        onChange={(e) => updateRow(r.id, { checked: e.target.checked })}
                      />
                    </td>
                    {r.unparsed ? (
                      <td colSpan={5} className="text-muted-foreground">
                        Couldn&apos;t parse: <code className="text-xs">{r.raw}</code>
                      </td>
                    ) : (
                      <>
                        <td>
                          <input
                            type="date"
                            value={r.date}
                            onChange={(e) => updateRow(r.id, { date: e.target.value })}
                          />
                        </td>
                        <td>{r.type}</td>
                        <td>
                          {r.matchedTicker ?? (
                            <a
                              className="text-primary underline"
                              href={`/request-company?name=${encodeURIComponent(r.companyName ?? '')}&isin=${encodeURIComponent(r.isin ?? '')}`}
                            >
                              {r.companyName} — request company
                            </a>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            value={r.quantity}
                            onChange={(e) => updateRow(r.id, { quantity: Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={r.pricePerShare}
                            onChange={(e) =>
                              updateRow(r.id, { pricePerShare: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {r.isDuplicate
                            ? 'Possible duplicate'
                            : r.matchedTicker
                              ? 'Matched'
                              : 'No matching company'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Importing…' : 'Import selected'}
          </Button>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-sm">
            Created: <span className="font-semibold text-primary">{result.created}</span>
          </p>
          {result.skipped.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5 max-h-48 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  <code className="text-xs bg-muted px-1 rounded">{s.line}</code> — {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
