"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { Input } from "@/components/ui/input";

export function CompanySearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  const handleSearch = useDebouncedCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    params.delete("page");
    router.push(`/admin/companies?${params.toString()}`);
  }, 300);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQ(e.target.value);
      handleSearch(e.target.value);
    },
    [handleSearch]
  );

  return (
    <Input
      value={q}
      onChange={onChange}
      placeholder="Search by name or ticker..."
      className="max-w-xs"
    />
  );
}
