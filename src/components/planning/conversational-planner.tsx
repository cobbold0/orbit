"use client";

import React, { useId, useState } from "react";
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
import { Card } from "@/components/ui/page";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export function ConversationalPlanner() {
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

  return (
    <Card title="Ask Orbit">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-2 flex items-center gap-2"
      >
        <label htmlFor={inputId} className="visually-hidden">
          Ask Orbit to plan, move or find something
        </label>
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
          placeholder="Move dashboard to Friday"
          className="input min-w-0 flex-1 bg-base-100"
        />
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="btn btn-primary shrink-0"
        >
          {isLoading ? (
            <span
              className="loading loading-spinner loading-xs"
              aria-hidden="true"
            />
          ) : (
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{isLoading ? "Working" : "Ask"}</span>
        </button>
      </form>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="mt-3 text-[0.9375rem] font-medium text-error">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4">
            <p className="whitespace-pre-line">
              {toPlainText(result.replyMarkdown)}
            </p>

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
                  <div key={i} className="orbit-row">
                    <div className="orbit-row-main">
                      <p className="title">
                        {mut.mutationKind === "RESCHEDULE_TASK"
                          ? `Move "${mut.taskTitle}"`
                          : `Add "${mut.title}"`}
                      </p>
                      <p className="meta">{toPlainText(mut.explanation)}</p>
                    </div>
                    {applied[i] ? (
                      <p className="meta inline-flex items-center gap-1.5 font-medium text-success">
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
    </Card>
  );
}
