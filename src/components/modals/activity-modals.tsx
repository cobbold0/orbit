"use client";

import React, { useId, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  createRoutineAction,
  deleteRoutineAction,
  logActivityCheckInAction,
  updateRoutineAction,
} from "@/app/actions/orbit-actions";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface ActivityAreaOption {
  id: string;
  name: string;
}

const WEEK_DAYS = [
  { num: 1, short: "Mon" },
  { num: 2, short: "Tue" },
  { num: 3, short: "Wed" },
  { num: 4, short: "Thu" },
  { num: 5, short: "Fri" },
  { num: 6, short: "Sat" },
  { num: 7, short: "Sun" },
] as const;

export function LogActivityModal({
  lifeAreas,
  defaultAreaId,
  triggerLabel = "Log work",
  triggerClassName = "btn btn-primary",
}: {
  lifeAreas: ActivityAreaOption[];
  defaultAreaId?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const { notify } = useOrbitToast();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setTimeout(() => titleRef.current?.focus(), 20);
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
        title="Log work"
        maxWidthClass="sm:max-w-md"
      >
        <p className="meta mb-3">
          Record something you already spent time on.
        </p>
        <form
          ref={formRef}
          action={async (formData) => {
            await logActivityCheckInAction(formData);
            formRef.current?.reset();
            close();
            notify("Work logged");
          }}
          className="space-y-3"
        >
          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-title`} className="fieldset-legend">
              What did you work on?
            </label>
            <input
              ref={titleRef}
              id={`${idBase}-title`}
              name="title"
              type="text"
              required
              autoComplete="off"
              placeholder="Vocal warmups, Odoo sprint review"
              className="input w-full"
            />
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-area`} className="fieldset-legend">
                Area
              </label>
              <select
                id={`${idBase}-area`}
                name="lifeAreaId"
                defaultValue={defaultAreaId ?? lifeAreas[0]?.id ?? ""}
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
              <label htmlFor={`${idBase}-min`} className="fieldset-legend">
                Duration in minutes
              </label>
              <input
                id={`${idBase}-min`}
                name="durationMinutes"
                type="text"
                inputMode="numeric"
                defaultValue="45"
                className="input w-full"
              />
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-loc`} className="fieldset-legend">
              Location (optional)
            </label>
            <input
              id={`${idBase}-loc`}
              name="physicalLocation"
              type="text"
              autoComplete="off"
              placeholder="Basilissa Office, Home"
              className="input w-full"
            />
          </fieldset>

          <div className="modal-action">
            <button type="button" onClick={close} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton pendingLabel="Saving">Save to log</SubmitButton>
          </div>
        </form>
      </OrbitModal>
    </>
  );
}

export function CreateRoutineModal({
  lifeAreas,
  defaultAreaId,
  triggerLabel = "New routine",
  triggerClassName = "btn btn-secondary",
}: {
  lifeAreas: ActivityAreaOption[];
  defaultAreaId?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const { notify } = useOrbitToast();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setTimeout(() => titleRef.current?.focus(), 20);
  }

  function close() {
    dialogRef.current?.close();
  }

  function toggleDay(dayNum: number) {
    setDays((prev) =>
      prev.includes(dayNum)
        ? prev.filter((d) => d !== dayNum)
        : [...prev, dayNum].sort((a, b) => a - b)
    );
  }

  return (
    <>
      <button type="button" onClick={open} className={triggerClassName}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>{triggerLabel}</span>
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title="New routine"
        maxWidthClass="sm:max-w-lg"
      >
        <p className="meta mb-3">
          Set a repeating weekly block so Orbit knows your usual schedule and
          location.
        </p>
        <form
          ref={formRef}
          action={async (formData) => {
            await createRoutineAction(formData);
            formRef.current?.reset();
            setDays([1, 2, 3, 4, 5]);
            close();
            notify("Routine created");
          }}
          className="space-y-3"
        >
          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-title`} className="fieldset-legend">
              Title
            </label>
            <input
              ref={titleRef}
              id={`${idBase}-title`}
              name="title"
              type="text"
              required
              autoComplete="off"
              placeholder="Basilissa office days, Vocal practice"
              className="input w-full"
            />
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-area`} className="fieldset-legend">
                Area
              </label>
              <select
                id={`${idBase}-area`}
                name="lifeAreaId"
                defaultValue={defaultAreaId ?? lifeAreas[0]?.id ?? ""}
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
              <label htmlFor={`${idBase}-kind`} className="fieldset-legend">
                Type
              </label>
              <select
                id={`${idBase}-kind`}
                name="kind"
                defaultValue="WORK_BLOCK"
                className="select w-full"
              >
                <option value="LOCATION_WINDOW">Office or location</option>
                <option value="WORK_BLOCK">Work block</option>
                <option value="CLASS_SCHEDULE">Class schedule</option>
                <option value="HABIT">Habit or practice</option>
              </select>
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Days</legend>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {days.map((d) => (
                <input key={d} type="hidden" name="daysOfWeek" value={d} />
              ))}
              {WEEK_DAYS.map((d) => {
                const active = days.includes(d.num);
                return (
                  <button
                    key={d.num}
                    type="button"
                    onClick={() => toggleDay(d.num)}
                    className={`btn btn-sm px-3 select-none active:scale-95 transition-all ${
                      active ? "btn-neutral font-semibold" : "btn-secondary"
                    }`}
                  >
                    <span>{d.short}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-start`} className="fieldset-legend">
                Start time
              </label>
              <input
                id={`${idBase}-start`}
                name="startTimeLocal"
                type="time"
                required
                defaultValue="09:00"
                className="input w-full"
              />
            </fieldset>

            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-end`} className="fieldset-legend">
                End time
              </label>
              <input
                id={`${idBase}-end`}
                name="endTimeLocal"
                type="time"
                required
                defaultValue="17:00"
                className="input w-full"
              />
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-loc`} className="fieldset-legend">
              Location (optional)
            </label>
            <input
              id={`${idBase}-loc`}
              name="physicalLocation"
              type="text"
              autoComplete="off"
              placeholder="Basilissa Office, Online"
              className="input w-full"
            />
          </fieldset>

          <div className="modal-action">
            <button type="button" onClick={close} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton pendingLabel="Creating">Create routine</SubmitButton>
          </div>
        </form>
      </OrbitModal>
    </>
  );
}

export interface EditableRoutineShape {
  id: string;
  title: string;
  lifeAreaId?: string | null;
  kind?: string;
  daysOfWeek: number[];
  startTimeLocal: string;
  endTimeLocal: string;
  physicalLocation?: string | null;
}

export function EditRoutineModal({
  routine,
  lifeAreas,
  triggerLabel = "Edit",
  triggerClassName = "btn btn-ghost btn-xs gap-1",
}: {
  routine: EditableRoutineShape;
  lifeAreas: ActivityAreaOption[];
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [days, setDays] = useState<number[]>(routine.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [isDeleting, setIsDeleting] = useState(false);
  const { notify } = useOrbitToast();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setDays(routine.daysOfWeek ?? [1, 2, 3, 4, 5]);
    dialog.showModal();
    setTimeout(() => titleRef.current?.focus(), 20);
  }

  function close() {
    dialogRef.current?.close();
  }

  function toggleDay(dayNum: number) {
    setDays((prev) =>
      prev.includes(dayNum)
        ? prev.filter((d) => d !== dayNum)
        : [...prev, dayNum].sort((a, b) => a - b)
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Edit routine ${routine.title}`}
        className={triggerClassName}
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
        <span>{triggerLabel}</span>
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title="Edit routine"
        maxWidthClass="sm:max-w-lg"
      >
        <form
          ref={formRef}
          action={async (formData) => {
            await updateRoutineAction(formData);
            close();
            notify("Routine updated");
          }}
          className="space-y-3"
        >
          <input type="hidden" name="routineId" value={routine.id} />

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-title`} className="fieldset-legend">
              Title
            </label>
            <input
              ref={titleRef}
              id={`${idBase}-title`}
              name="title"
              type="text"
              required
              autoComplete="off"
              defaultValue={routine.title}
              className="input w-full"
            />
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-area`} className="fieldset-legend">
                Area
              </label>
              <select
                id={`${idBase}-area`}
                name="lifeAreaId"
                defaultValue={routine.lifeAreaId ?? lifeAreas[0]?.id ?? ""}
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
              <label htmlFor={`${idBase}-kind`} className="fieldset-legend">
                Type
              </label>
              <select
                id={`${idBase}-kind`}
                name="kind"
                defaultValue={routine.kind ?? "WORK_BLOCK"}
                className="select w-full"
              >
                <option value="LOCATION_WINDOW">Office or location</option>
                <option value="WORK_BLOCK">Work block</option>
                <option value="CLASS_SCHEDULE">Class schedule</option>
                <option value="HABIT">Habit or practice</option>
              </select>
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Days</legend>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {days.map((d) => (
                <input key={d} type="hidden" name="daysOfWeek" value={d} />
              ))}
              {WEEK_DAYS.map((d) => {
                const active = days.includes(d.num);
                return (
                  <button
                    key={d.num}
                    type="button"
                    onClick={() => toggleDay(d.num)}
                    className={`btn btn-sm px-3 select-none active:scale-95 transition-all ${
                      active ? "btn-neutral font-semibold" : "btn-secondary"
                    }`}
                  >
                    <span>{d.short}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-start`} className="fieldset-legend">
                Start time
              </label>
              <input
                id={`${idBase}-start`}
                name="startTimeLocal"
                type="time"
                required
                defaultValue={routine.startTimeLocal}
                className="input w-full"
              />
            </fieldset>

            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-end`} className="fieldset-legend">
                End time
              </label>
              <input
                id={`${idBase}-end`}
                name="endTimeLocal"
                type="time"
                required
                defaultValue={routine.endTimeLocal}
                className="input w-full"
              />
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-loc`} className="fieldset-legend">
              Location (optional)
            </label>
            <input
              id={`${idBase}-loc`}
              name="physicalLocation"
              type="text"
              autoComplete="off"
              defaultValue={routine.physicalLocation ?? ""}
              placeholder="Basilissa Office, Online"
              className="input w-full"
            />
          </fieldset>

          <div className="modal-action justify-between">
            <button
              type="button"
              disabled={isDeleting}
              onClick={async () => {
                if (!confirm(`Delete routine "${routine.title}"?`)) return;
                setIsDeleting(true);
                const fd = new FormData();
                fd.append("routineId", routine.id);
                await deleteRoutineAction(fd);
                close();
                notify("Routine deleted");
              }}
              className="btn btn-ghost text-error gap-1.5"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>{isDeleting ? "Deleting..." : "Delete"}</span>
            </button>

            <div className="flex items-center gap-2">
              <button type="button" onClick={close} className="btn btn-ghost">
                Cancel
              </button>
              <SubmitButton pendingLabel="Saving">Save changes</SubmitButton>
            </div>
          </div>
        </form>
      </OrbitModal>
    </>
  );
}
