'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageHeading } from '@/components/layout/page-heading';
import { bulkImportTransactions, type ImportResult } from './actions';

export default function ImportTransactionsPage() {
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleImport = () => {
    startTransition(async () => {
      const res = await bulkImportTransactions(csvText);
      setResult(res);
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeading>Import transactions</PageHeading>

      <Card>
        <CardHeader>
          <CardTitle>Paste CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Format: <code>date,ticker,type,shares,pricePerShare,amount</code>{' '}
            (header row required). For DIVIDEND types, set amount; for BUY/SELL,
            set shares and pricePerShare.
          </p>
          <textarea
            className="w-full h-48 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder={`date,ticker,type,shares,pricePerShare,amount\n2024-01-15,AAPL,BUY,10,150.50,\n2024-03-20,MSFT,DIVIDEND,,,25.00`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <Button
            onClick={handleImport}
            disabled={isPending || !csvText.trim()}
          >
            {isPending ? 'Importing…' : 'Import'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.error ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <>
                <p className="text-sm">
                  Created:{' '}
                  <span className="font-semibold text-primary">
                    {result.created}
                  </span>
                </p>
                {result.skipped.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">
                      Skipped ({result.skipped.length}):
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 max-h-48 overflow-y-auto">
                      {result.skipped.map((s, i) => (
                        <li key={i}>
                          <code className="text-xs bg-muted px-1 rounded">
                            {s.line}
                          </code>
                          {' — '}
                          {s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
