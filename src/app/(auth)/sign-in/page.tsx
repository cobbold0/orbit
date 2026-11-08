"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { signIn } from "@/lib/auth/auth-client";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn.email({
        email: email.trim(),
        password,
      });

      if (result.error) {
        setError(result.error.message || "Invalid email or password.");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDemoSignIn() {
    setError(null);
    setIsDemoLoading(true);

    try {
      const result = await signIn.email({
        email: "alex@orbit.local",
        password: "password123",
      });

      if (result.error) {
        setError(result.error.message || "Could not sign in with demo account.");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Unable to sign in with demo account.");
    } finally {
      setIsDemoLoading(false);
    }
  }

  return (
    <div className="card bg-base-100 border border-base-300/70 shadow-xs rounded-2xl p-6 sm:p-7">
      <h1 className="text-xl font-bold tracking-tight text-base-content">
        Sign in
      </h1>

      {error && (
        <div
          role="alert"
          className="alert alert-error alert-soft mt-4 text-xs py-2.5 px-3 flex items-center gap-2 rounded-lg"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleCredentialsSubmit} className="mt-5 space-y-4">
        <fieldset className="fieldset p-0">
          <legend className="fieldset-legend text-xs font-medium text-base-content/80 mb-1">
            Email address
          </legend>
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/40 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@orbit.local"
              className="input input-bordered w-full pl-9 text-sm"
              disabled={isLoading || isDemoLoading}
            />
          </div>
        </fieldset>

        <fieldset className="fieldset p-0">
          <legend className="fieldset-legend text-xs font-medium text-base-content/80 mb-1">
            Password
          </legend>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/40 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input input-bordered w-full pl-9 text-sm"
              disabled={isLoading || isDemoLoading}
            />
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={isLoading || isDemoLoading}
          className="btn btn-primary w-full mt-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Signing in...</span>
            </>
          ) : (
            <span>Sign in</span>
          )}
        </button>
      </form>

      <div className="divider text-xs text-base-content/40 my-5">or</div>

      <button
        type="button"
        onClick={handleDemoSignIn}
        disabled={isLoading || isDemoLoading}
        className="btn btn-outline btn-block text-xs font-medium gap-2"
      >
        {isDemoLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Signing in as demo user...</span>
          </>
        ) : (
          <>
            <span>Sign in as Alex Vance (Demo)</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </>
        )}
      </button>

      <p className="mt-6 text-center text-xs text-base-content/60">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-primary hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-base-content/40" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
