"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { synthesizeGoogleSpeechAction } from "@/app/actions/orbit-actions";

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

  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isGoogleVoice, setIsGoogleVoice] = useState(false);
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);

  const sentencesRef = useRef<string[]>([]);
  const currentIdxRef = useRef(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const googleAudioDataUrlRef = useRef<string | null>(null);

  useEffect(() => {
    sentencesRef.current =
      digestText.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [digestText];
  }, [digestText]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);

  function stopAllAudio() {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentenceIdx(0);
    currentIdxRef.current = 0;
  }

  async function startPlayback() {
    setIsOpen(true);

    // If already paused, simply resume
    if (isPaused) {
      if (audioElementRef.current) {
        audioElementRef.current.play().catch(() => {});
      } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.resume();
      }
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    stopAllAudio();
    setIsPlaying(true);
    setIsPaused(false);

    // 1. Check if we already have Google TTS cached
    if (googleAudioDataUrlRef.current) {
      playGoogleWavAudio(googleAudioDataUrlRef.current);
      return;
    }

    // 2. Fetch Google Studio Speech
    setIsLoadingAudio(true);
    try {
      const res = await synthesizeGoogleSpeechAction(digestText);
      if (res.audioBase64) {
        const dataUrl = `data:${res.mimeType || "audio/wav"};base64,${res.audioBase64}`;
        googleAudioDataUrlRef.current = dataUrl;
        setIsGoogleVoice(true);
        setIsLoadingAudio(false);
        playGoogleWavAudio(dataUrl);
        return;
      }
    } catch {
      // Fall through to browser speech synthesis
    }

    setIsLoadingAudio(false);
    setIsGoogleVoice(false);
    playBrowserSpeechSynthesis();
  }

  function playGoogleWavAudio(dataUrl: string) {
    const audio = new Audio(dataUrl);
    audioElementRef.current = audio;

    audio.onended = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentSentenceIdx(sentencesRef.current.length - 1);
    };

    audio.ontimeupdate = () => {
      if (!audio.duration || sentencesRef.current.length === 0) return;
      const progress = audio.currentTime / audio.duration;
      const estimatedIdx = Math.min(
        Math.floor(progress * sentencesRef.current.length),
        sentencesRef.current.length - 1
      );
      setCurrentSentenceIdx(estimatedIdx);
    };

    audio.onerror = () => {
      setIsGoogleVoice(false);
      playBrowserSpeechSynthesis();
    };

    audio.play().catch(() => {
      setIsGoogleVoice(false);
      playBrowserSpeechSynthesis();
    });
  }

  function playBrowserSpeechSynthesis() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsPlaying(false);
      return;
    }

    window.speechSynthesis.cancel();
    currentIdxRef.current = 0;
    setCurrentSentenceIdx(0);
    speakBrowserNextChunk(0);
  }

  function speakBrowserNextChunk(idx: number) {
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
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Samantha") ||
            v.name.includes("Google") ||
            v.name.includes("Natural") ||
            v.name.includes("Daniel"))
      ) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      null;

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (currentIdxRef.current === idx) {
        const nextIdx = idx + 1;
        currentIdxRef.current = nextIdx;
        setCurrentSentenceIdx(nextIdx);
        speakBrowserNextChunk(nextIdx);
      }
    };

    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") return;
      setIsPlaying(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  function handlePause() {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
    }
    setIsPaused(true);
    setIsPlaying(false);
  }

  function handleRestart() {
    stopAllAudio();
    setTimeout(() => {
      void startPlayback();
    }, 50);
  }

  return (
    <>
      {/* Speaker Trigger on the Date Line */}
      <button
        type="button"
        onClick={() => {
          if (!isPlaying && !isPaused) {
            void startPlayback();
          } else {
            setIsOpen(true);
          }
        }}
        aria-label="Daily audio digest"
        title="Listen to today's digest"
        className="btn btn-ghost btn-xs sm:btn-sm gap-1.5 rounded-full border border-base-300/80 bg-base-100/80 hover:bg-base-200 transition-all shrink-0 px-2 sm:px-3 text-base-content"
      >
        {isPlaying ? (
          <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
            <span className="w-0.5 h-1.5 bg-primary animate-bounce" />
            <span className="w-0.5 h-3 bg-primary animate-bounce [animation-delay:150ms]" />
            <span className="w-0.5 h-2 bg-primary animate-bounce [animation-delay:300ms]" />
          </span>
        ) : (
          <Volume2 className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
        )}
        <span className="hidden sm:inline text-xs font-medium">
          {isPlaying ? "Playing digest" : "Daily digest"}
        </span>
      </button>

      {/* Modern Bottom Sheet Presentation */}
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            stopAllAudio();
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="max-w-xl mx-auto sm:rounded-t-3xl max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader className="mb-3 text-left">
            <div className="flex items-center justify-between gap-3 pr-8">
              <SheetTitle className="flex items-center gap-2 text-lg font-bold tracking-tight text-base-content">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>Daily Audio Briefing</span>
              </SheetTitle>
              {isGoogleVoice && (
                <span className="badge badge-primary badge-xs py-1 px-2 font-semibold">
                  Google AI Voice
                </span>
              )}
            </div>
          </SheetHeader>

          <div className="space-y-4">
            {/* Audio Wave Visualizer Stage */}
            <div className="flex flex-col items-center justify-center rounded-2xl bg-base-200/50 p-4 border border-base-300/60 text-center">
              {isLoadingAudio ? (
                <div className="flex flex-col items-center gap-2 py-3">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <p className="text-xs text-base-content/70 font-medium">
                    Synthesizing with Google Studio AI...
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-1 h-8">
                    {[12, 24, 18, 30, 14, 26, 16, 22].map((h, i) => (
                      <span
                        key={i}
                        className={`w-1 rounded-full transition-all duration-300 ${
                          isPlaying
                            ? "bg-primary animate-pulse"
                            : isPaused
                            ? "bg-warning h-3"
                            : "bg-base-300 h-2"
                        }`}
                        style={{
                          height: isPlaying ? `${h}px` : undefined,
                          animationDelay: `${i * 100}ms`,
                        }}
                      />
                    ))}
                  </div>

                  <p className="text-xs font-semibold text-base-content/80">
                    {isPlaying
                      ? isGoogleVoice
                        ? "Google Aoede Studio Voice playing"
                        : "Speaking daily digest"
                      : isPaused
                      ? "Briefing paused"
                      : "Briefing complete"}
                  </p>
                </div>
              )}
            </div>

            {/* Read-Along Transcript with Real-Time Sentence Tracking */}
            <div className="max-h-56 overflow-y-auto rounded-2xl bg-base-100 p-4 border border-base-300/70 text-sm leading-relaxed text-base-content/90 font-medium">
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

            {/* Bottom Controls Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-base-300/60">
              <div className="flex items-center gap-2">
                {isPlaying ? (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="btn btn-primary btn-sm gap-1.5"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startPlayback()}
                    className="btn btn-primary btn-sm gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{isPaused ? "Resume" : "Play again"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRestart}
                  aria-label="Restart briefing"
                  className="btn btn-ghost btn-sm gap-1 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Restart</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopAllAudio();
                  setIsOpen(false);
                }}
                className="btn btn-ghost btn-sm text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
