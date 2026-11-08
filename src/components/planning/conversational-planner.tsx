"use client";

import React, { useState } from "react";
import { Check, SendHorizontal } from "lucide-react";
import {
  applyProposedMutationAction,
  askOrbitPlannerAction,
} from "@/app/actions/orbit-actions";
import type {
  ConversationalPlanResponse,
  ProposedMutation,
} from "@/lib/ai/schemas";
import { toPlainText } from "@/lib/time/format";

export function ConversationalPlanner() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversationalPlanResponse | null>(null);
  const [applied, setApplied] = useState<Record<number, string>>({});

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
    try {
      const res = await applyProposedMutationAction(mutation);
      setApplied((prev) => ({ ...prev, [index]: res.confirmationMessage }));
    } catch {
      setError("Could not apply that change. Try again.");
    }
  }

  return (
    <section className="card">
      <h2 className="h2">Ask Orbit</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-3 flex items-center gap-2"
      >
        <label htmlFor="ask-input" className="visually-hidden">
          Ask Orbit to plan, move or find something
        </label>
        <input
          id="ask-input"
          type="text"
          value={prompt}
          autoComplete="off"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.nativeEvent.isComposing) {
              e.preventDefault();
            }
          }}
          placeholder="Move dashboard to Friday"
          className="field min-w-0 flex-1"
        />
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="button button-primary shrink-0"
        >
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          <span>{isLoading ? "Working" : "Ask"}</span>
        </button>
      </form>

      <div aria-live="polite">
        {error && <p className="mt-4 text-[0.9375rem] text-[#b42318]">{error}</p>}

        {result && (
          <div className="mt-5">
            <p className="whitespace-pre-line">{toPlainText(result.replyMarkdown)}</p>

            {result.citedFacts.length > 0 && (
              <div className="mt-4">
                <h3 className="h3">From your data</h3>
                <ul className="meta mt-1 list-disc space-y-1 ps-5">
                  {result.citedFacts.map((f, i) => (
                    <li key={i}>{toPlainText(f)}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.assumptionsOrSuggestions.length > 0 && (
              <div className="mt-4">
                <h3 className="h3">Assumed</h3>
                <ul className="meta mt-1 list-disc space-y-1 ps-5">
                  {result.assumptionsOrSuggestions.map((a, i) => (
                    <li key={i}>{toPlainText(a)}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.proposedMutations.length > 0 && (
              <div className="mt-3">
                {result.proposedMutations.map((mut, i) => (
                  <div key={i} className="row">
                    <div className="row-main">
                      <p className="title">
                        {mut.mutationKind === "RESCHEDULE_TASK"
                          ? `Move "${mut.taskTitle}"`
                          : `Add "${mut.title}"`}
                      </p>
                      <p className="meta">{toPlainText(mut.explanation)}</p>
                    </div>
                    {applied[i] ? (
                      <p className="meta inline-flex items-center gap-2 font-medium text-[#15803d]">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Done
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void confirm(mut, i)}
                        className="button button-primary"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
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
    </section>
  );
}
