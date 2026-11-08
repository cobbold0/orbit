"use client";

import React, { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { recoverOrRescheduleTaskAction } from "@/app/actions/orbit-actions";
import { AreaLabel } from "@/components/ui/page";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";
import { formatDuration } from "@/lib/time/format";

export interface WindowFlexTask {
  id: string;
  title: string;
  estimatedMinutes?: number | null;
  lifeArea: {
    name: string;
    colorToken?: string | null;
  };
}

export function ScheduleWindowModal({
  dateStr,
  startLabel,
  endLabel,
  tasks,
}: {
  dateStr: string;
  startLabel: string;
  endLabel: string;
  tasks: WindowFlexTask[];
}) {
  const timeInputId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [chosenTime, setChosenTime] = useState(startLabel);
  const { notify } = useOrbitToast();

  if (tasks.length === 0) return null;

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setChosenTime(startLabel);
    dialog.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Schedule task between ${startLabel} and ${endLabel}`}
        className="btn btn-secondary btn-sm"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Schedule</span>
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title="Schedule flexible task"
        maxWidthClass="sm:max-w-lg"
      >
        <p className="meta mb-3">
          Free window: <span className="tabular">{startLabel}</span> to{" "}
          <span className="tabular">{endLabel}</span>
        </p>

        <fieldset className="fieldset mb-3">
          <label htmlFor={timeInputId} className="fieldset-legend">
            Start time
          </label>
          <input
            id={timeInputId}
            type="time"
            value={chosenTime}
            onChange={(e) => setChosenTime(e.target.value)}
            className="input w-full sm:max-w-[11rem]"
          />
        </fieldset>

        <div className="max-h-72 overflow-y-auto border-t border-base-300">
          {tasks.map((task) => (
            <div key={task.id} className="orbit-row">
              <div className="orbit-row-main">
                <p className="title">{task.title}</p>
                <p className="meta flex flex-wrap items-center gap-x-3">
                  <AreaLabel
                    name={task.lifeArea.name}
                    token={task.lifeArea.colorToken}
                  />
                  {task.estimatedMinutes && (
                    <span>{formatDuration(task.estimatedMinutes)}</span>
                  )}
                </p>
              </div>
              <form
                action={async (formData) => {
                  await recoverOrRescheduleTaskAction(formData);
                  close();
                  notify(`Scheduled "${task.title}"`);
                }}
              >
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="recoveryKind" value="CUSTOM_SCHEDULE" />
                <input type="hidden" name="scheduledDate" value={dateStr} />
                <input type="hidden" name="scheduledTime" value={chosenTime} />
                <SubmitButton
                  pendingLabel="Scheduling"
                  className="btn btn-primary btn-sm"
                >
                  Choose
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>

        <div className="modal-action">
          <button type="button" onClick={close} className="btn btn-ghost">
            Close
          </button>
        </div>
      </OrbitModal>
    </>
  );
}
