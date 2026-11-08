"use client";

import React, { useId, useRef } from "react";
import { CalendarClock } from "lucide-react";
import { recoverOrRescheduleTaskAction } from "@/app/actions/orbit-actions";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export function RescheduleTaskModal({
  taskId,
  taskTitle,
  commitmentType,
  defaultDateStr,
  defaultTimeStr = "14:00",
  triggerLabel,
  hideLabel = false,
  triggerClassName = "btn btn-ghost btn-sm btn-square",
}: {
  taskId: string;
  taskTitle: string;
  commitmentType?: string;
  defaultDateStr?: string;
  defaultTimeStr?: string;
  triggerLabel?: string;
  hideLabel?: boolean;
  triggerClassName?: string;
}) {
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const { notify } = useOrbitToast();

  const label =
    triggerLabel ??
    (commitmentType === "SCHEDULED" ? "Move" : "Schedule");

  const fallbackTomorrow = (() => {
    if (defaultDateStr) return defaultDateStr;
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  })();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setTimeout(() => dateInputRef.current?.focus(), 20);
  }

  function close() {
    dialogRef.current?.close();
  }

  async function runQuick(kind: string, toastText: string) {
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("recoveryKind", kind);
    await recoverOrRescheduleTaskAction(fd);
    close();
    notify(toastText);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`${label} ${taskTitle}`}
        title={`${label} task`}
        className={triggerClassName}
      >
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        {!hideLabel && !triggerClassName.includes("btn-square") && (
          <span>{label}</span>
        )}
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title={label === "Schedule" ? "Schedule task" : "Move task"}
        maxWidthClass="sm:max-w-md"
      >
        <p className="title mb-3">{taskTitle}</p>

        <div className="space-y-4">
          <div>
            <p className="meta-soft mb-2 font-medium">Quick options</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void runQuick("TOMORROW_MORNING", "Scheduled for tomorrow morning")
                }
                className="btn btn-secondary btn-sm"
              >
                Tomorrow 09:30
              </button>
              <button
                type="button"
                onClick={() =>
                  void runQuick("TOMORROW_AFTERNOON", "Scheduled for tomorrow afternoon")
                }
                className="btn btn-secondary btn-sm"
              >
                Tomorrow 14:00
              </button>
              {commitmentType !== "FLEXIBLE" && (
                <button
                  type="button"
                  onClick={() =>
                    void runQuick("MAKE_FLEXIBLE", "Moved to flexible tasks")
                  }
                  className="btn btn-secondary btn-sm"
                >
                  Make flexible
                </button>
              )}
            </div>
          </div>

          <form
            action={async (formData) => {
              await recoverOrRescheduleTaskAction(formData);
              close();
              notify("Schedule updated");
            }}
            className="space-y-3 border-t border-base-300 pt-3"
          >
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="recoveryKind" value="CUSTOM_SCHEDULE" />

            <div className="grid gap-3 sm:grid-cols-2">
              <fieldset className="fieldset">
                <label htmlFor={`${idBase}-date`} className="fieldset-legend">
                  Date
                </label>
                <input
                  ref={dateInputRef}
                  id={`${idBase}-date`}
                  name="scheduledDate"
                  type="date"
                  required
                  defaultValue={fallbackTomorrow}
                  className="input w-full"
                />
              </fieldset>
              <fieldset className="fieldset">
                <label htmlFor={`${idBase}-time`} className="fieldset-legend">
                  Start time
                </label>
                <input
                  id={`${idBase}-time`}
                  name="scheduledTime"
                  type="time"
                  required
                  defaultValue={defaultTimeStr}
                  className="input w-full"
                />
              </fieldset>
            </div>

            <div className="modal-action">
              <button type="button" onClick={close} className="btn btn-ghost">
                Cancel
              </button>
              <SubmitButton pendingLabel="Saving">Save time</SubmitButton>
            </div>
          </form>
        </div>
      </OrbitModal>
    </>
  );
}
