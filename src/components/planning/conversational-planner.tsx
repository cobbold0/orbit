"use client";

import React, { useId, useRef, useState } from "react";
import { Check, MessageSquare, Mic, SendHorizontal, Sparkles } from "lucide-react";
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
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRef = useRef<any>(null);
  const { notify } = useOrbitToast();

  function toggleSpeech() {
    if (isListening) {
      speechRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      notify("Speech recognition is not supported in this browser.", "info");
      return;
    }

    const recognition = new SpeechRecognition();
    speechRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let full = "";
      for (let i = 0; i < event.results.length; i++) {
        full += event.results[i][0].transcript;
      }
      setPrompt(full);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }

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
            className="input input-bordered w-full pl-9 pr-10 text-sm bg-base-100"
          />
          <button
            type="button"
            onClick={toggleSpeech}
            aria-label={isListening ? "Stop listening" : "Dictate with voice"}
            className={`absolute right-2.5 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle ${
              isListening
                ? "text-error bg-error/10 animate-pulse"
                : "text-base-content/50 hover:text-base-content"
            }`}
          >
            <Mic className="h-4 w-4" />
          </button>
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
            {isLoading ? "Thinking..." : "Ask"}
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
          <div className="mt-4 p-4 rounded-2xl bg-base-200/50 border border-base-300/60 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Orbit Advisor</span>
            </div>

            <p className="whitespace-pre-line text-sm leading-relaxed text-base-content font-medium">
              {toPlainText(result.replyMarkdown)}
            </p>

            {result.assumptionsOrSuggestions.length > 0 && (
              <div className="pt-2 border-t border-base-300/50">
                <h4 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                  Suggestions & Advice
                </h4>
                <ul className="meta mt-1 list-disc space-y-1 ps-5 text-xs text-base-content/80">
                  {result.assumptionsOrSuggestions.map((a, i) => (
                    <li key={i}>{toPlainText(a)}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.citedFacts.length > 0 && (
              <div className="pt-2 border-t border-base-300/50">
                <h4 className="text-[0.7rem] font-semibold text-base-content/50 uppercase tracking-wider">
                  Confirmed from your data
                </h4>
                <ul className="meta mt-1 list-disc space-y-0.5 ps-5 text-[0.75rem] text-base-content/60">
                  {result.citedFacts.map((f, i) => (
                    <li key={i}>{toPlainText(f)}</li>
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
                          : mut.mutationKind === "CREATE_TASK"
                          ? `Add "${mut.title}"`
                          : mut.mutationKind === "UPDATE_PREFERENCE"
                          ? "Update Preferences"
                          : mut.mutationKind === "COMPLETE_TASK"
                          ? `Complete "${mut.taskTitle}"`
                          : mut.mutationKind === "CREATE_PROJECT"
                          ? `Create Project "${mut.title}"`
                          : mut.mutationKind === "CREATE_ROUTINE"
                          ? `Create Routine "${mut.title}"`
                          : mut.mutationKind === "LOG_ACTIVITY"
                          ? `Log Activity "${mut.title}"`
                          : "Proposed Change"}
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
