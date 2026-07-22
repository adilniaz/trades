'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  parsePdfStatement,
  confirmPdfImport,
  type PdfReviewRow,
  type ImportResult,
} from './actions';

type EditableRow = PdfReviewRow & { checked: boolean };

// Native <input type="date"> displays in the OS locale's day order in
// Chromium (it ignores the element's `lang`, unlike Firefox), so dd-mm-yyyy
// can't be guaranteed that way — format/parse it ourselves instead.
function isoToDdMmYyyy(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function ddMmYyyyToIso(display: string): string | null {
  const match = display.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  const valid =
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() + 1 === Number(m) &&
    date.getUTCDate() === Number(d);
  return valid ? `${y}-${m}-${d}` : null;
}

function StatusBadge({ row }: { row: EditableRow }) {
  if (row.isDuplicate)
    return <Badge variant="destructive">Possible duplicate</Badge>;
  if (row.matchedTicker) return <Badge variant="secondary">Matched</Badge>;
  return <Badge variant="outline">No matching company</Badge>;
}

export function PdfImportPanel() {
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();
  // Raw text typed into a date cell mid-edit, keyed by row id — kept
  // separate from the row's ISO `date` so keystrokes aren't clobbered
  // while the string doesn't parse as a full dd-mm-yyyy yet.
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});

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
        })),
      );
    });
  };

  const updateRow = (id: string, patch: Partial<EditableRow>) => {
    setRows((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev,
    );
  };

  const handleConfirm = () => {
    if (!rows) return;
    const toImport = rows.filter(
      (r) => r.checked && !r.unparsed && r.date && r.type && r.isin,
    );
    startTransition(async () => {
      const res = await confirmPdfImport(
        toImport.map((r) => ({
          date: r.date!,
          type: r.type!,
          isin: r.isin!,
          quantity: r.quantity!,
          pricePerShare: r.pricePerShare!,
          forceDuplicate: r.isDuplicate,
        })),
      );
      setResult(res);
      setRows(null);
    });
  };

  return (
    <div className="space-y-4">
      <Input
        type="file"
        accept="application/pdf"
        disabled={isPending}
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        className="max-w-sm"
      />

      {parseError && <p className="text-sm text-destructive">{parseError}</p>}

      {rows && rows.length > 0 && (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price/share</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={r.checked}
                      onChange={(e) =>
                        updateRow(r.id, { checked: e.target.checked })
                      }
                    />
                  </TableCell>
                  {r.unparsed ? (
                    <TableCell
                      colSpan={6}
                      className="whitespace-normal text-muted-foreground"
                    >
                      Couldn&apos;t parse:{' '}
                      <code className="text-xs">{r.raw}</code>
                    </TableCell>
                  ) : (
                    <>
                      <TableCell>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="dd-mm-yyyy"
                          className="w-28"
                          value={dateDrafts[r.id] ?? isoToDdMmYyyy(r.date)}
                          onChange={(e) =>
                            setDateDrafts((prev) => ({
                              ...prev,
                              [r.id]: e.target.value,
                            }))
                          }
                          onBlur={() => {
                            const draft = dateDrafts[r.id];
                            if (draft !== undefined) {
                              const iso = ddMmYyyyToIso(draft);
                              if (iso) updateRow(r.id, { date: iso });
                              setDateDrafts((prev) => {
                                const next = { ...prev };
                                delete next[r.id];
                                return next;
                              });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal">
                        {r.matchedTicker ? (
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {r.matchedTicker}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.companyName}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-0.5">
                            <span>{r.companyName}</span>
                            <a
                              className="text-xs text-primary underline hover:no-underline"
                              href={`/request-company?name=${encodeURIComponent(r.companyName ?? '')}&isin=${encodeURIComponent(r.isin ?? '')}`}
                            >
                              Request company
                            </a>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-20"
                          value={r.quantity}
                          onChange={(e) =>
                            updateRow(r.id, {
                              quantity: Number(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.0001"
                          className="w-28"
                          value={r.pricePerShare}
                          onChange={(e) =>
                            updateRow(r.id, {
                              pricePerShare: Number(e.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge row={r} />
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Importing…' : 'Import selected'}
          </Button>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-sm">
            Created:{' '}
            <span className="font-semibold text-primary">{result.created}</span>
          </p>
          {result.skipped.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5 max-h-48 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  <code className="text-xs bg-muted px-1 rounded">
                    {s.line}
                  </code>{' '}
                  — {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
