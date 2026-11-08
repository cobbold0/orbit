"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Mic, Pause, Pencil, Play, Plus, Square } from "lucide-react";
import {
  captureMemoryInboxAction,
  resolveExtractedActionAction,
  transcribeAudioBase64Action,
} from "@/app/actions/orbit-actions";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

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

export function MemoryCaptureForm({
  textareaRef,
  onSuccess,
  onCancel,
}: {
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const idBase = useId();
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resolvedTextareaRef = textareaRef ?? internalTextareaRef;
  const { notify } = useOrbitToast();

  const [kind, setKind] = useState<Kind>("TEXT_NOTE");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [consent, setConsent] = useState(false);

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
            setText((prev) =>
              prev ? `${prev.trim()} ${piece.trim()}` : piece.trim()
            );
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
            setStatus("Transcribing audio...");
            try {
              const res = await transcribeAudioBase64Action(base64, blob.type);
              if (res.transcript) {
                setText((prev) =>
                  prev ? `${prev}\n${res.transcript}` : res.transcript
                );
              }
              setStatus(null);
            } catch {
              setStatus(
                "Could not transcribe the audio. Type or paste the note instead."
              );
            }
          };
          reader.readAsDataURL(blob);
        };
        recorder.start();
        recorderRef.current = recorder;
      } catch {
        setStatus(
          "Microphone access was denied. Type or paste the note instead."
        );
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
    <div>
      <p className="meta mb-3">
        Save thoughts, meeting notes, or a voice memo. Orbit spots tasks inside
        your note for you to approve in Notes.
      </p>

      <div
        role="tablist"
        aria-label="Note source type"
        className="tabs tabs-box tabs-sm mb-3 w-full"
      >
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => setKind(k.id)}
            className={`tab flex-1 font-medium ${
              kind === k.id ? "tab-active" : ""
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {needsRecorder && (
        <div className="orbit-row border-b border-base-300 pb-3 pt-1">
          <label className="meta inline-flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span>Everyone present agrees to be recorded</span>
          </label>
          <div className="orbit-row-actions">
            {!recording ? (
              <button
                type="button"
                onClick={() => void start()}
                className="btn btn-secondary btn-sm"
              >
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
                  className="btn btn-secondary btn-sm"
                >
                  {paused ? (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{paused ? "Resume" : "Pause"}</span>
                </button>
                <button
                  type="button"
                  onClick={stop}
                  className="btn btn-primary btn-sm"
                >
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
          if (recording) stop();
          await captureMemoryInboxAction(formData);
          setText("");
          setTitle("");
          setSource("");
          setSeconds(0);
          onSuccess();
          notify("Note saved");
        }}
        className="mt-2 space-y-3"
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

        <fieldset className="fieldset">
          <label htmlFor={`${idBase}-text`} className="fieldset-legend">
            Note or transcript
          </label>
          <textarea
            ref={resolvedTextareaRef}
            id={`${idBase}-text`}
            name="rawContent"
            rows={4}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste meeting notes, a message, or thoughts to sort later"
            className="textarea w-full"
          />
        </fieldset>

        <details className="rounded-xl border border-base-300 bg-base-200/50 px-3.5 py-2.5">
          <summary className="cursor-pointer text-[0.9375rem] font-medium text-[var(--text-2)]">
            Add title or speaker context (optional)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-title`} className="fieldset-legend">
                Title
              </label>
              <input
                id={`${idBase}-title`}
                name="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input w-full"
              />
            </fieldset>
            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-source`} className="fieldset-legend">
                Who or what
              </label>
              <input
                id={`${idBase}-source`}
                name="speakerContext"
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="input w-full"
              />
            </fieldset>
          </div>
        </details>

        <div className="modal-action">
          <button
            type="button"
            onClick={() => {
              if (recording) stop();
              onCancel();
            }}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <SubmitButton pendingLabel="Saving" disabled={!text.trim()}>
            Save note
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function MemoryCaptureModal({
  triggerLabel = "New note",
  triggerClassName = "btn btn-primary btn-sm sm:btn-md",
}: {
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setTimeout(() => textareaRef.current?.focus(), 20);
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" onClick={open} className={triggerClassName}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>{triggerLabel}</span>
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title="New note"
        maxWidthClass="sm:max-w-xl"
      >
        <MemoryCaptureForm
          textareaRef={textareaRef}
          onSuccess={close}
          onCancel={close}
        />
      </OrbitModal>
    </>
  );
}

export function EditExtractedActionModal({
  item,
  lifeAreas,
}: {
  item: {
    id: string;
    title: string;
    lifeAreaId: string | null;
    classification: string;
    waitingOnTarget: string | null;
    suggestedCommitment: string;
  };
  lifeAreas: { id: string; name: string }[];
}) {
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const { notify } = useOrbitToast();

  const initialCommitment =
    item.classification === "FOLLOW_UP" && item.waitingOnTarget
      ? "WAITING"
      : item.suggestedCommitment || "FLEXIBLE";

  const [commitment, setCommitment] = useState<string>(initialCommitment);

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setCommitment(initialCommitment);
    dialog.showModal();
    setTimeout(() => titleRef.current?.focus(), 20);
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Edit ${item.title}`}
        className="btn btn-ghost btn-sm"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Edit</span>
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title="Edit extracted task"
        maxWidthClass="sm:max-w-md"
      >
        <form
          action={async (formData) => {
            await resolveExtractedActionAction(formData);
            close();
            notify("Approved and added to tasks");
          }}
          className="space-y-3"
        >
          <input type="hidden" name="extractedActionId" value={item.id} />
          <input type="hidden" name="decision" value="APPROVE" />

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-title`} className="fieldset-legend">
              Title
            </label>
            <input
              ref={titleRef}
              id={`${idBase}-title`}
              name="overrideTitle"
              type="text"
              required
              defaultValue={item.title}
              className="input w-full"
            />
          </fieldset>

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-area`} className="fieldset-legend">
              Area
            </label>
            <select
              id={`${idBase}-area`}
              name="overrideLifeAreaId"
              defaultValue={item.lifeAreaId ?? lifeAreas[0]?.id ?? ""}
              className="select w-full"
            >
              {lifeAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Type</legend>
            <div className="tabs tabs-box w-full">
              {(
                [
                  ["FLEXIBLE", "Flexible"],
                  ["WAITING", "Waiting"],
                  ["SCHEDULED", "Scheduled"],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className="tab flex-1 font-medium">
                  <input
                    type="radio"
                    name="overrideCommitmentType"
                    value={val}
                    checked={commitment === val}
                    onChange={() => setCommitment(val)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="modal-action">
            <button type="button" onClick={close} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton pendingLabel="Saving">Save and approve</SubmitButton>
          </div>
        </form>
      </OrbitModal>
    </>
  );
}
