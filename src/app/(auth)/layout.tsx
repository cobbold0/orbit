import Link from "next/link";
import { Compass } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col justify-center items-center bg-base-100 px-4 py-12 sm:px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-bold tracking-tight text-xl hover:opacity-90 transition-opacity"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-content">
              <Compass className="h-5 w-5" aria-hidden="true" />
            </div>
            <span>Orbit</span>
          </Link>
          <p className="mt-2 text-xs text-base-content/60">
            Your commitments, projects and time in one place
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}
