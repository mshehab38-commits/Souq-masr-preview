"use client";

import { useRouter } from "next/navigation";
import { Pagination } from "@/components/ui/Pagination";

export function StorePaginationClient({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();

  function handlePageChange(nextPage: number) {
    router.push(`?page=${nextPage}`);
  }

  return <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />;
}
