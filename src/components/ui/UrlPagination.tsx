"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "./Pagination";

// Path-agnostic version of the pattern established by
// app/search/SearchPaginationClient.tsx (which hardcodes /search) — reused
// across every other server-rendered "my own paginated list" page
// (/orders, /dashboard/orders, /listings/mine) instead of duplicating a
// near-identical one-off wrapper per page.
export function UrlPagination({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handlePageChange(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`${pathname}?${params.toString()}`);
  }

  return <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />;
}
