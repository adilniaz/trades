"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { bulkImportCompanies } from "@/app/admin/companies/actions";

export default function BulkImportPage() {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    skipped: { row: number; reason: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!csvText.trim()) {
      setError("Please paste CSV content");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await bulkImportCompanies(csvText);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Bulk Import Companies</h1>
        <Button variant="outline" onClick={() => router.push("/admin/companies")}>
          Back
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Paste CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            One company per line: <code>Name,Ticker,NonCompliantPct</code>. Header row is optional.
          </p>
          <textarea
            className="w-full h-48 rounded-lg border border-input bg-transparent p-3 text-sm font-mono focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`Company Name,Ticker,NonCompliant%\nApple Inc.,AAPL,4.94\nMicrosoft Corp,MSFT,2.10`}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button onClick={handleImport} disabled={loading}>
            {loading ? "Importing…" : "Import"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              <span className="font-medium text-green-600">{result.created} created</span>
              {result.skipped.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}&middot; {result.skipped.length} skipped
                </span>
              )}
            </p>
            {result.skipped.length > 0 && (
              <ul className="text-sm space-y-1">
                {result.skipped.map((s, i) => (
                  <li key={i} className="text-red-600">
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
            {result.created > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/admin/companies")}
                className="mt-2"
              >
                View companies
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
