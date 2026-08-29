"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/Button";

// App Router error boundary — catches any render/data-fetching error below
// the root layout. Runs in the browser (Next.js requires error.tsx to be a
// Client Component), so it reports to Sentry client-side (a safe no-op
// until NEXT_PUBLIC_SENTRY_DSN is set — see docs/OBSERVABILITY.md) rather
// than the server structured logger, which this context has no access to.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="font-cairo text-xl font-bold text-neutral-900">حدث خطأ غير متوقع</h1>
      <p className="text-sm text-neutral-500">
        نعتذر عن هذا الخلل. تم إبلاغ الفريق التقني تلقائياً. حاول مرة أخرى.
      </p>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </main>
  );
}
