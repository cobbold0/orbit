"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square } from "lucide-react";
import {
  captureMemoryInboxAction,
  transcribeAudioBase64Action,
} from "@/app/actions/orbit-actions";

type Kind = "TEXT_NOTE" | "MEETING_NOTES" | "VOICE_NOTE" | "PASTED_MESSAGE";

const KINDS: { id: Kind; label: string }[] = [
  { id: "TEXT_NOTE", label: "Note" },
  { id: "MEETING_NOTES", label: "Meeting" },
  { id: "VOICE_NOTE", label: "Voice" },
  { id: "PASTED_MESSAGE", label: "Message" },
];

interface SpeechRec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: (() => void) | null;
}

export function MemoryCaptureStudio() {
  const [kind, setKind] = useState<Kind>("TEXT_NOTE");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<SpeechRec | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const needsRecorder = kind === "VOICE_NOTE" || kind === "MEETING_NOTES";

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      speechRef.current?.stop();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, []);

  function startTimer() {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  async function start() {
    if (!consent) {
      setStatus("Confirm that everyone present agrees to the recording.");
      return;
    }
    setStatus(null);
    setSeconds(0);
    setRecording(true);
    setPaused(false);
    startTimer();

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Ctor) {
      try {
        const rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = "en-US";
        rec.onresult = (e) => {
          const piece = e.results[e.results.length - 1]?.[0]?.transcript ?? "";
          if (piece.trim()) {
            setText((prev) => (prev ? `${prev.trim()} ${piece.trim()}` : piece.trim()));
          }
        };
        rec.onerror = () => {};
        rec.start();
        speechRef.current = rec;
      } catch {
        /* dictation unavailable */
      }
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (chunksRef.current.length === 0) return;
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = String(reader.result ?? "").split(",")[1];
            if (!base64) return;
            setStatus("Transcribing");
            try {
              const res = await transcribeAudioBase64Action(base64, blob.type);
              if (res.transcript) {
                setText((prev) => (prev ? `${prev}\n${res.transcript}` : res.transcript));
              }
              setStatus(null);
            } catch {
              setStatus("Could not transcribe the audio. You can type the note instead.");
            }
          };
          reader.readAsDataURL(blob);
        };
        recorder.start();
        recorderRef.current = recorder;
      } catch {
        setStatus("Microphone access was denied. Type or paste the note instead.");
      }
    }
  }

  function togglePause() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      speechRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      startTimer();
      setPaused(false);
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    speechRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
    setPaused(false);
  }

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="h2">Capture</h2>
        <div className="segmented" role="group" aria-label="Type">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className="segmented-item"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {needsRecorder && (
        <div className="row">
          <label className="meta inline-flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>Everyone present agrees to be recorded</span>
          </label>
          <div className="row-actions">
            {!recording ? (
              <button type="button" onClick={start} className="button button-secondary">
                <Mic className="h-4 w-4" aria-hidden="true" />
                <span>Record</span>
              </button>
            ) : (
              <>
                <span className="tabular font-semibold" role="timer">
                  {clock}
                </span>
                <button
                  type="button"
                  onClick={togglePause}
                  className="button button-secondary"
                >
                  {paused ? (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{paused ? "Resume" : "Pause"}</span>
                </button>
                <button type="button" onClick={stop} className="button button-primary">
                  <Square className="h-4 w-4" aria-hidden="true" />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {status && (
        <p aria-live="polite" className="meta mt-2">
          {status}
        </p>
      )}

      <form
        action={async (formData) => {
          setBusy(true);
          try {
            await captureMemoryInboxAction(formData);
            setText("");
            setTitle("");
            setSource("");
            setSeconds(0);
          } finally {
            setBusy(false);
          }
        }}
        className="mt-3 space-y-3"
      >
        <input type="hidden" name="captureKind" value={kind} />
        <input
          type="hidden"
          name="voiceDurationSec"
          value={seconds > 0 ? String(seconds) : ""}
        />
        <input
          type="hidden"
          name="consentConfirmed"
          value={String(needsRecorder ? consent : true)}
        />

        <div>
          <label htmlFor="cap-text" className="label">
            Text
          </label>
          <textarea
            id="cap-text"
            name="rawContent"
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="field"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cap-title" className="label">
              Title (optional)
            </label>
            <input
              id="cap-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="cap-source" className="label">
              Who or what (optional)
            </label>
            <input
              id="cap-source"
              name="speakerContext"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="field"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="button button-primary"
          >
            {busy ? "Analysing" : "Capture"}
          </button>
        </div>
      </form>
    </section>
  );
}
