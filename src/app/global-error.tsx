"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Catches failures in the root layout itself — rarer than error.tsx's
// cases, but without this a root-layout crash would show Next.js's raw
// default error screen with no Sentry reporting and no Arabic messaging.
// Must render its own <html>/<body> since the root layout that would
// normally provide them is exactly what may have failed.
export default function GlobalError({
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
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-4 text-center font-sans text-neutral-900">
        <h1 className="text-xl font-bold">حدث خطأ غير متوقع</h1>
        <p className="text-sm text-neutral-500">نعتذر عن هذا الخلل. تم إبلاغ الفريق التقني تلقائياً.</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          إعادة المحاولة
        </button>
      </body>
    </html>
  );
}
