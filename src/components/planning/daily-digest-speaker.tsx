"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";

export interface DailyDigestSpeakerProps {
  firstName: string;
  greeting: string;
  dateStr: string;
  activeCommitment?: string;
  scheduledTasks: { title: string; area: string; time?: string }[];
  flexibleTasks: { title: string; area: string }[];
  checkInCount: number;
  location?: string;
}

export function buildHumanDailyDigest({
  firstName,
  greeting,
  activeCommitment,
  scheduledTasks,
  flexibleTasks,
  checkInCount,
  location,
}: DailyDigestSpeakerProps): string {
  const parts: string[] = [];

  // 1. Natural warm greeting
  parts.push(
    `${greeting}, ${firstName}! How are you doing today? Hope you are having a wonderful start to your day.`
  );

  // 2. Location routine context if present
  if (location) {
    parts.push(`You are based at ${location}.`);
  }

  // 3. Current active focus
  if (activeCommitment) {
    parts.push(`Right now, you are in focus on "${activeCommitment}".`);
  }

  // 4. Detailed schedule commitments
  if (scheduledTasks.length > 0) {
    if (scheduledTasks.length === 1) {
      const task = scheduledTasks[0]!;
      parts.push(
        `On your schedule today, you have one commitment: "${task.title}" under ${task.area}${
          task.time ? ` at ${task.time}` : ""
        }.`
      );
    } else {
      const taskDescriptions = scheduledTasks
        .map(
          (t) => `"${t.title}" under ${t.area}${t.time ? ` at ${t.time}` : ""}`
        )
        .join(", and ");
      parts.push(
        `On your schedule today, you have ${scheduledTasks.length} commitments: ${taskDescriptions}.`
      );
    }
  } else {
    parts.push(
      "Your schedule is open today with no fixed appointments or hard deadlines on your calendar."
    );
  }

  // 5. Flexible priorities and advice
  if (flexibleTasks.length > 0) {
    const topFlex = flexibleTasks[0]!;
    parts.push(
      `You also have ${flexibleTasks.length} flexible task${
        flexibleTasks.length > 1 ? "s" : ""
      } on deck. My advice is to start with "${topFlex.title}" under ${
        topFlex.area
      } to build easy momentum.`
    );
  }

  // 6. Attention / check-ins
  if (checkInCount > 0) {
    parts.push(
      `You have ${checkInCount} check-in waiting for your quick confirmation whenever you take a break.`
    );
  }

  // 7. Warm closing
  parts.push(
    "Take things at a steady pace, remember to take quick breathers between focus blocks, and have a productive, wonderful day!"
  );

  return parts.join(" ");
}

export function DailyDigestSpeaker(props: DailyDigestSpeakerProps) {
  const digestText = buildHumanDailyDigest(props);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);

  const sentencesRef = useRef<string[]>([]);
  const currentIdxRef = useRef(0);
  const activeVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Initialize sentences
  useEffect(() => {
    sentencesRef.current =
      digestText.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [digestText];
  }, [digestText]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Pick natural voice
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    function selectBestVoice() {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;

      // Prefer natural English voices (Samantha on Apple, Google on Chrome, Natural on Edge)
      const preferred =
        voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            (v.name.includes("Samantha") ||
              v.name.includes("Google") ||
              v.name.includes("Natural") ||
              v.name.includes("Daniel") ||
              v.name.includes("Arthur"))
        ) ||
        voices.find((v) => v.lang.startsWith("en")) ||
        voices[0] ||
        null;

      activeVoiceRef.current = preferred;
    }

    selectBestVoice();
    window.speechSynthesis.onvoiceschanged = selectBestVoice;
  }, []);

  function speakNextChunk(idx: number) {
    if (idx >= sentencesRef.current.length) {
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentSentenceIdx(0);
      currentIdxRef.current = 0;
      return;
    }

    const chunk = sentencesRef.current[idx];
    if (!chunk) return;

    const utterance = new SpeechSynthesisUtterance(chunk.trim());
    if (activeVoiceRef.current) {
      utterance.voice = activeVoiceRef.current;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (currentIdxRef.current === idx) {
        const nextIdx = idx + 1;
        currentIdxRef.current = nextIdx;
        setCurrentSentenceIdx(nextIdx);
        speakNextChunk(nextIdx);
      }
    };

    utterance.onerror = (e) => {
      // If stopped manually, do nothing
      if (e.error === "canceled" || e.error === "interrupted") return;
      setIsPlaying(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  function handlePlay() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Speech synthesis is not supported in this browser.");
      return;
    }

    setIsExpanded(true);

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    window.speechSynthesis.cancel();
    currentIdxRef.current = 0;
    setCurrentSentenceIdx(0);
    setIsPlaying(true);
    setIsPaused(false);
    speakNextChunk(0);
  }

  function handlePause() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  }

  function handleStop() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentenceIdx(0);
    currentIdxRef.current = 0;
  }

  function handleRestart() {
    handleStop();
    setTimeout(() => {
      handlePlay();
    }, 50);
  }

  return (
    <div className="relative">
      {/* Trigger Button */}
      {!isExpanded ? (
        <button
          type="button"
          onClick={handlePlay}
          aria-label="Listen to today's digest"
          className="btn btn-secondary btn-sm gap-2 rounded-full border-base-300/80 shadow-xs hover:border-base-content/20 hover:bg-base-200 transition-all shrink-0"
        >
          <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-medium text-xs text-base-content">
            Listen to digest
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          {isPlaying ? (
            <button
              type="button"
              onClick={handlePause}
              aria-label="Pause digest"
              className="btn btn-primary btn-sm gap-2 rounded-full px-3 shadow-xs"
            >
              {/* Animated Sound Wave Bars */}
              <span className="flex items-end gap-0.5 h-3.5" aria-hidden="true">
                <span className="w-0.5 h-2 bg-primary-content animate-bounce" />
                <span className="w-0.5 h-3.5 bg-primary-content animate-bounce [animation-delay:150ms]" />
                <span className="w-0.5 h-2.5 bg-primary-content animate-bounce [animation-delay:300ms]" />
              </span>
              <span className="text-xs font-semibold">Pause digest</span>
            </button>
          ) : isPaused ? (
            <button
              type="button"
              onClick={handlePlay}
              aria-label="Resume digest"
              className="btn btn-primary btn-sm gap-1.5 rounded-full px-3 shadow-xs"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span className="text-xs font-semibold">Resume</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              aria-label="Replay digest"
              className="btn btn-secondary btn-sm gap-1.5 rounded-full px-3"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span className="text-xs font-semibold">Play again</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRestart}
            aria-label="Restart digest from beginning"
            className="btn btn-ghost btn-xs btn-circle text-base-content/60"
            title="Restart"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              handleStop();
              setIsExpanded(false);
            }}
            aria-label="Close audio digest"
            className="btn btn-ghost btn-xs btn-circle text-base-content/60"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Expanded Audio Digest Transcript Card */}
      {isExpanded && (
        <div className="mt-3 rounded-2xl border border-base-300 bg-base-200/50 p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold tracking-tight text-base-content uppercase">
                Today&apos;s Audio Digest
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-base-content/60">
              {isPlaying && (
                <span className="flex items-center gap-1.5 text-success font-medium text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  Speaking
                </span>
              )}
              {isPaused && (
                <span className="text-warning font-medium text-xs">Paused</span>
              )}
            </div>
          </div>

          {/* Full readable transcript with sentence tracking */}
          <div className="text-sm leading-relaxed text-base-content/90 font-medium">
            {sentencesRef.current.map((sentence, sIdx) => {
              const isCurrent = isPlaying && currentSentenceIdx === sIdx;
              return (
                <span
                  key={sIdx}
                  className={`transition-colors duration-200 ${
                    isCurrent
                      ? "bg-primary/10 text-primary px-1 py-0.5 rounded-md font-semibold"
                      : ""
                  }`}
                >
                  {sentence}{" "}
                </span>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-base-300/60 text-xs">
            <span className="text-base-content/50">
              Audio generated directly from your commitments
            </span>
            <div className="flex items-center gap-2">
              {isPlaying ? (
                <button
                  type="button"
                  onClick={handlePause}
                  className="btn btn-ghost btn-xs gap-1"
                >
                  <Pause className="h-3 w-3" />
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePlay}
                  className="btn btn-ghost btn-xs gap-1"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Play</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleStop}
                className="btn btn-ghost btn-xs gap-1"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
