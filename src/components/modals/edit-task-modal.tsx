"use client";

import React, { useId, useRef, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import {
  deleteTaskAction,
  updateTaskAction,
} from "@/app/actions/orbit-actions";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface EditableTaskShape {
  id: string;
  title: string;
  lifeAreaId?: string;
  projectId?: string | null;
  priority?: string;
  estimatedMinutes?: number | null;
  notes?: string | null;
}

export function EditTaskModal({
  task,
  lifeAreas,
  triggerClassName = "btn btn-ghost btn-xs gap-1",
  triggerLabel,
}: {
  task: EditableTaskShape;
  lifeAreas?: { id: string; name: string }[];
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { notify } = useOrbitToast();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setTimeout(() => titleInputRef.current?.focus(), 20);
  }

  function close() {
    dialogRef.current?.close();
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const fd = new FormData();
      fd.append("taskId", task.id);
      await deleteTaskAction(fd);
      close();
      notify("Task deleted");
    } catch {
      notify("Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Edit task ${task.title}`}
        className={triggerClassName}
        title="Edit task"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        {triggerLabel && <span>{triggerLabel}</span>}
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title="Edit task"
        maxWidthClass="sm:max-w-lg"
      >
        <form
          action={async (formData) => {
            await updateTaskAction(formData);
            close();
            notify("Task updated");
          }}
          className="space-y-3"
        >
          <input type="hidden" name="taskId" value={task.id} />

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-title`} className="fieldset-legend">
              Title
            </label>
            <input
              ref={titleInputRef}
              id={`${idBase}-title`}
              name="title"
              type="text"
              required
              autoComplete="off"
              defaultValue={task.title}
              className="input w-full"
            />
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            {lifeAreas && lifeAreas.length > 0 && (
              <fieldset className="fieldset">
                <label htmlFor={`${idBase}-area`} className="fieldset-legend">
                  Area
                </label>
                <select
                  id={`${idBase}-area`}
                  name="lifeAreaId"
                  defaultValue={task.lifeAreaId ?? lifeAreas[0]?.id ?? ""}
                  className="select w-full"
                >
                  {lifeAreas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </fieldset>
            )}

            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-prio`} className="fieldset-legend">
                Priority
              </label>
              <select
                id={`${idBase}-prio`}
                name="priority"
                defaultValue={task.priority ?? "NORMAL"}
                className="select w-full"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-mins`} className="fieldset-legend">
              Estimated minutes
            </label>
            <input
              id={`${idBase}-mins`}
              name="estimatedMinutes"
              type="number"
              min="5"
              step="5"
              defaultValue={task.estimatedMinutes ?? ""}
              placeholder="e.g. 30"
              className="input w-full"
            />
          </fieldset>

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-notes`} className="fieldset-legend">
              Notes (optional)
            </label>
            <textarea
              id={`${idBase}-notes`}
              name="notes"
              rows={2}
              defaultValue={task.notes ?? ""}
              placeholder="Any details or context for this task..."
              className="textarea w-full"
            />
          </fieldset>

          <div className="modal-action justify-between">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
              className="btn btn-ghost text-error gap-1.5"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
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
