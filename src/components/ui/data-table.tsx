"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Column = { key: string; header: string; className?: string };
type Row = Record<string, React.ReactNode>;

type Props = {
  columns: Column[];
  rows: Row[];
  totalCount: number;
  page: number;
  pageSize: number;
  baseUrl: string;
};

function buildUrl(base: string, p: number, ps: number): string {
  const u = new URL(base, "http://x");
  u.searchParams.set("page", String(p));
  u.searchParams.set("pageSize", String(ps));
  return u.pathname + u.search;
}

export function DataTable({
  columns,
  rows,
  totalCount,
  page,
  pageSize,
  baseUrl,
}: Props) {
  const totalPages = Math.ceil(totalCount / pageSize);

  if (rows.length === 0 && totalCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">No entries found.</p>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.className}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.key} className={c.className}>
                  {row[c.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={
                  page > 1 ? buildUrl(baseUrl, page - 1, pageSize) : undefined
                }
              />
            </PaginationItem>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
              const p = i + 1 + Math.max(0, page - 4);
              if (p > totalPages) return null;
              return (
                <PaginationItem key={p}>
                  <PaginationLink
                    href={buildUrl(baseUrl, p, pageSize)}
                    isActive={p === page}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                href={
                  page < totalPages
                    ? buildUrl(baseUrl, page + 1, pageSize)
                    : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
