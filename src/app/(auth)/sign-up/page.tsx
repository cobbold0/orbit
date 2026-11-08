"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Lock, Mail, User } from "lucide-react";
import { signUp } from "@/lib/auth/auth-client";
import { initializeNewUserWorkspaceAction } from "@/app/actions/orbit-actions";

function SignUpForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      if (result.error) {
        setError(result.error.message || "Could not create account.");
        return;
      }

      // Initialize default timezone and workspace areas for new user
      try {
        const clientTimeZone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos";
        await initializeNewUserWorkspaceAction({ clientTimeZone });
      } catch {
        // Workspace will fall back safely
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Unable to create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="card bg-base-100 border border-base-300/70 shadow-xs rounded-2xl p-6 sm:p-7">
      <h1 className="text-xl font-bold tracking-tight text-base-content">
        Create account
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

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <fieldset className="fieldset p-0">
          <legend className="fieldset-legend text-xs font-medium text-base-content/80 mb-1">
            Full name
          </legend>
          <div className="relative">
            <User
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/40 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="input input-bordered w-full pl-9 text-sm"
              disabled={isLoading}
            />
          </div>
        </fieldset>

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
              placeholder="jane@example.com"
              className="input input-bordered w-full pl-9 text-sm"
              disabled={isLoading}
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="input input-bordered w-full pl-9 text-sm"
              disabled={isLoading}
            />
          </div>
        </fieldset>

        <fieldset className="fieldset p-0">
          <legend className="fieldset-legend text-xs font-medium text-base-content/80 mb-1">
            Confirm password
          </legend>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/40 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="input input-bordered w-full pl-9 text-sm"
              disabled={isLoading}
            />
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary w-full mt-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Creating account...</span>
            </>
          ) : (
            <span>Create account</span>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-base-content/60">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-base-content/40" />
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
