"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Home, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected errors safely on client without leaking sensitive tokens
    console.error("[Orbit ErrorBoundary]", error.message);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-base-100 border border-base-300 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-base-content">
            Something went wrong
          </h2>
          <p className="text-sm text-[var(--text-2)]">
            Orbit encountered an unexpected issue while rendering this page.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="btn btn-primary btn-sm sm:btn-md gap-2"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Try again</span>
          </button>
          <Link
            href="/"
            className="btn btn-secondary btn-sm sm:btn-md gap-2 bg-base-100"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>Back to Today</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
