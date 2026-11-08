import React from "react";
import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-base-100 border border-base-300 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-base-200 text-base-content">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-base-content">
            Page not found
          </h2>
          <p className="text-sm text-[var(--text-2)]">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>

        <div className="pt-2 flex justify-center">
          <Link href="/" className="btn btn-primary btn-sm sm:btn-md gap-2">
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>Return to Today</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
