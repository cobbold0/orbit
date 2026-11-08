"use client";

import React, { useId, useState } from "react";
import { Check, MessageSquare, SendHorizontal } from "lucide-react";
import {
  applyProposedMutationAction,
  askOrbitPlannerAction,
} from "@/app/actions/orbit-actions";
import type {
  ConversationalPlanResponse,
  ProposedMutation,
} from "@/lib/ai/schemas";
import { toPlainText } from "@/lib/time/format";
import { Card } from "@/components/ui/page";
import { useOrbitToast } from "@/components/ui/orbit-toast";

interface ConversationalPlannerProps {
  embedded?: boolean;
  placeholder?: string;
}

export function ConversationalPlanner({
  embedded = false,
  placeholder = "Ask Orbit to plan, move or update a commitment...",
}: ConversationalPlannerProps = {}) {
  const inputId = useId();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversationalPlanResponse | null>(null);
  const [applied, setApplied] = useState<Record<number, string>>({});
  const { notify } = useOrbitToast();

  async function submit() {
    const text = prompt.trim();
    if (!text) return;
    setIsLoading(true);
    setError(null);
    setApplied({});
    try {
      setResult(await askOrbitPlannerAction(text));
    } catch {
      setError("Could not get a response. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function confirm(mutation: ProposedMutation, index: number) {
    setApplyingIdx(index);
    try {
      const res = await applyProposedMutationAction(mutation);
      setApplied((prev) => ({ ...prev, [index]: res.confirmationMessage }));
      notify("Change applied");
    } catch {
      setError("Could not apply that change. Try again.");
    } finally {
      setApplyingIdx(null);
    }
  }

  const content = (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor={inputId} className="visually-hidden">
          Ask Orbit to plan, move or find something
        </label>
        <div className="relative min-w-0 flex-1">
          <MessageSquare
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/40 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="text"
            value={prompt}
            autoComplete="off"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.nativeEvent.isComposing) {
                e.preventDefault();
              }
            }}
            placeholder={placeholder}
            className="input input-bordered w-full pl-9 text-sm bg-base-100"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="btn btn-primary btn-sm sm:btn-md shrink-0 gap-1.5"
        >
          {isLoading ? (
            <span
              className="loading loading-spinner loading-xs"
              aria-hidden="true"
            />
          ) : (
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {isLoading ? "Working..." : "Ask"}
          </span>
        </button>
      </form>

      <div aria-live="polite">
        {error && (
          <p
            role="alert"
            className="mt-3 text-[0.9375rem] font-medium text-error"
          >
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4 p-4 rounded-xl bg-base-200/50 border border-base-300/60">
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {toPlainText(result.replyMarkdown)}
            </p>

            {result.citedFacts.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                  From your data
                </h4>
                <ul className="meta mt-1 list-disc space-y-1 ps-5 text-xs">
                  {result.citedFacts.map((f, i) => (
                    <li key={i}>{toPlainText(f)}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.assumptionsOrSuggestions.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                  Assumed
                </h4>
                <ul className="meta mt-1 list-disc space-y-1 ps-5 text-xs">
                  {result.assumptionsOrSuggestions.map((a, i) => (
                    <li key={i}>{toPlainText(a)}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.proposedMutations.length > 0 && (
              <div className="mt-3 space-y-2">
                {result.proposedMutations.map((mut, i) => (
                  <div key={i} className="orbit-row">
                    <div className="orbit-row-main">
                      <p className="title text-sm">
                        {mut.mutationKind === "RESCHEDULE_TASK"
                          ? `Move "${mut.taskTitle}"`
                          : `Add "${mut.title}"`}
                      </p>
                      <p className="meta text-xs">
                        {toPlainText(mut.explanation)}
                      </p>
                    </div>
                    {applied[i] ? (
                      <p className="meta inline-flex items-center gap-1.5 font-medium text-success text-xs">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        <span>Applied</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={applyingIdx === i}
                        onClick={() => void confirm(mut, i)}
                        className="btn btn-primary btn-sm"
                      >
                        {applyingIdx === i ? (
                          <span
                            className="loading loading-spinner loading-xs"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span>Confirm</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <Card title="Ask Orbit">{content}</Card>;
}
