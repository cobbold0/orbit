"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  ListTodo,
  Loader2,
  Mic,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  processQuickVoiceCommandAction,
  QuickVoiceCommandResult,
  transcribeAudioBase64Action,
} from "@/app/actions/orbit-actions";
import { useOrbitToast } from "@/components/ui/orbit-toast";

interface QuickVoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type VoiceState = "idle" | "listening" | "processing" | "success" | "error";

export function QuickVoiceDialog({ isOpen, onClose }: QuickVoiceDialogProps) {
  const { notify } = useOrbitToast();
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<QuickVoiceCommandResult | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRef = useRef<any>(null);

  // Reset state when opened or closed
  useEffect(() => {
    if (isOpen) {
      setState("idle");
      setTranscript("");
      setDurationSec(0);
      setErrorMessage(null);
      setResult(null);
      void startListening();
    } else {
      stopAllMedia();
    }
    return () => {
      stopAllMedia();
    };
  }, [isOpen]);

  function stopAllMedia() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      speechRef.current?.stop();
    } catch {
      // Ignore
    }
    speechRef.current = null;

    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {
      // Ignore
    }
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startListening() {
    setState("listening");
    setTranscript("");
    setDurationSec(0);
    setErrorMessage(null);
    setResult(null);

    // 1. Live Web Speech API if supported for live word-by-word preview
    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onresult = (e: any) => {
          let fullText = "";
          for (let i = 0; i < e.results.length; i++) {
            fullText += (e.results[i]?.[0]?.transcript ?? "") + " ";
          }
          if (fullText.trim()) {
            setTranscript(fullText.trim());
          }
        };
        rec.onerror = () => {};
        rec.start();
        speechRef.current = rec;
      } catch {
        // Continue to MediaRecorder
      }
    }

    // 2. Audio recording via MediaRecorder for Gemini backup
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.start(250);
        recorderRef.current = recorder;

        timerRef.current = setInterval(() => {
          setDurationSec((prev) => prev + 1);
        }, 1000);
      } catch {
        setState("error");
        setErrorMessage("Microphone access was denied. Please allow microphone permissions.");
      }
    } else {
      setState("error");
      setErrorMessage("Audio recording is not supported in this browser.");
    }
  }

  async function handleFinishAndProcess() {
    if (state !== "listening") return;
    setState("processing");

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      speechRef.current?.stop();
    } catch {
      // Ignore
    }

    // Determine final text: if we already have a live transcript from SpeechRecognition, use it!
    const liveText = transcript.trim();

    if (liveText && liveText.length > 2) {
      await processTranscript(liveText);
      return;
    }

    // Otherwise, convert audio chunks and transcribe with Gemini
    const recorder = recorderRef.current;
    if (!recorder || chunksRef.current.length === 0) {
      setState("error");
      setErrorMessage("No audio was recorded. Please try speaking again.");
      return;
    }

    try {
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = String(reader.result ?? "").split(",")[1];
          if (!base64) {
            setState("error");
            setErrorMessage("Could not read audio stream.");
            return;
          }
          try {
            const transRes = await transcribeAudioBase64Action(base64, blob.type);
            const text = transRes.transcript?.trim();
            if (!text) {
              setState("error");
              setErrorMessage("Could not detect speech in the audio recording.");
              return;
            }
            setTranscript(text);
            await processTranscript(text);
          } catch {
            setState("error");
            setErrorMessage("Failed to transcribe audio. Please try again.");
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.stop();
    } catch {
      setState("error");
      setErrorMessage("Failed to finalize audio recording.");
    }
  }

  async function processTranscript(text: string) {
    try {
      const res = await processQuickVoiceCommandAction(text);
      setResult(res);
      setState("success");
      notify(
        res.intent === "TASK"
          ? `Task created: ${res.title}`
          : res.intent === "ACTIVITY"
          ? `Work logged: ${res.title}`
          : `Note saved to Inbox`,
        "success"
      );

      // Auto close after 1.8 seconds on success
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      setState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to process voice command."
      );
    }
  }

  if (!isOpen) return null;

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const timeFormatted = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-voice-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (state !== "processing") onClose();
          }}
          className="absolute inset-0 bg-neutral/40 backdrop-blur-sm"
        />

        {/* Floating AI Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-base-100 p-6 sm:p-7 shadow-2xl border border-base-300"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </div>
              <h2
                id="quick-voice-title"
                className="text-base font-semibold tracking-tight text-base-content"
              >
                Quick Talk AI
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={state === "processing"}
              aria-label="Close voice dialog"
              className="btn btn-ghost btn-xs btn-circle text-base-content/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Central AI Visualizer Stage */}
          <div className="my-6 flex flex-col items-center justify-center py-2 text-center">
            {state === "listening" && (
              <div className="relative flex items-center justify-center">
                {/* Glowing Concentric Sound Waves */}
                <motion.div
                  animate={{
                    scale: [1, 1.4, 1],
                    opacity: [0.35, 0.1, 0.35],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 2.2,
                    ease: "easeInOut",
                  }}
                  className="absolute h-32 w-32 rounded-full bg-primary/20 blur-md"
                />
                <motion.div
                  animate={{
                    scale: [1, 1.25, 1],
                    opacity: [0.5, 0.2, 0.5],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.6,
                    ease: "easeInOut",
                  }}
                  className="absolute h-24 w-24 rounded-full bg-primary/30"
                />

                {/* Center Mic Button */}
                <button
                  type="button"
                  onClick={() => void handleFinishAndProcess()}
                  className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-content shadow-lg transition-transform active:scale-95"
                >
                  <Mic className="h-7 w-7 animate-pulse" aria-hidden="true" />
                </button>
              </div>
            )}

            {state === "processing" && (
              <div className="relative flex h-24 w-24 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            )}

            {state === "success" && result && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div className="mt-1 flex items-center gap-1.5 rounded-full bg-base-200 px-3 py-1 text-xs font-semibold text-base-content">
                  {result.intent === "TASK" && (
                    <>
                      <ListTodo className="h-3.5 w-3.5 text-primary" />
                      <span>Task Created</span>
                    </>
                  )}
                  {result.intent === "ACTIVITY" && (
                    <>
                      <Clock className="h-3.5 w-3.5 text-secondary" />
                      <span>Activity Logged</span>
                    </>
                  )}
                  {result.intent === "NOTE" && (
                    <>
                      <FileText className="h-3.5 w-3.5 text-accent" />
                      <span>Note Saved</span>
                    </>
                  )}
                </div>
                <p className="mt-1 font-medium text-sm text-base-content max-w-xs truncate">
                  &ldquo;{result.title}&rdquo;
                </p>
              </motion.div>
            )}

            {state === "error" && (
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error/15 text-error">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <p className="text-xs text-error max-w-xs">{errorMessage}</p>
              </div>
            )}

            {/* Status & Timer */}
            {state === "listening" && (
              <div className="mt-6 space-y-1">
                <p className="text-xs font-mono tabular text-primary font-semibold">
                  {timeFormatted}
                </p>
                <p className="text-xs text-base-content/60">
                  Listening... speak naturally.
                </p>
              </div>
            )}

            {state === "processing" && (
              <div className="mt-4">
                <p className="text-xs text-base-content/70 animate-pulse font-medium">
                  Orbit is organizing your request...
                </p>
              </div>
            )}
          </div>

          {/* Live Transcript / Examples Box */}
          <div className="min-h-16 rounded-2xl bg-base-200/70 p-3.5 border border-base-300/50 text-left">
            {transcript ? (
              <p className="text-xs leading-relaxed text-base-content font-medium">
                &ldquo;{transcript}&rdquo;
              </p>
            ) : (
              <div className="space-y-1 text-[0.75rem] text-base-content/50">
                <p className="font-semibold text-base-content/60">Examples to say:</p>
                <p>• &ldquo;Create a task to review contracts by Friday&rdquo;</p>
                <p>• &ldquo;Log 45 minutes on Orbit architecture&rdquo;</p>
                <p>• &ldquo;Take a note that Sarah agreed to send designs&rdquo;</p>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="mt-5 flex items-center justify-between gap-2 pt-1">
            {state === "listening" ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleFinishAndProcess()}
                  className="btn btn-primary btn-sm gap-1.5 px-4"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Done</span>
                </button>
              </>
            ) : state === "error" ? (
              <div className="flex w-full justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm text-xs"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => void startListening()}
                  className="btn btn-primary btn-sm text-xs"
                >
                  Try again
                </button>
              </div>
            ) : state === "success" ? (
              <div className="flex w-full justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-sm btn-ghost gap-1 text-xs text-success"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Done</span>
                </button>
              </div>
            ) : (
              <div className="h-8" />
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
