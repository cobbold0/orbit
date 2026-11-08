"use client";

import React, { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  createRoutineAction,
  logActivityCheckInAction,
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
              {WEEK_DAYS.map((d) => {
                const active = days.includes(d.num);
                return (
                  <label
                    key={d.num}
                    className={`btn btn-sm cursor-pointer ${
                      active ? "btn-neutral" : "btn-secondary"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="daysOfWeek"
                      value={d.num}
                      checked={active}
                      onChange={() => toggleDay(d.num)}
                      className="visually-hidden"
                    />
                    <span>{d.short}</span>
                  </label>
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
