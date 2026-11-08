"use client";

import React, { useId, useRef } from "react";
import { Plus } from "lucide-react";
import { addMilestoneAction } from "@/app/actions/orbit-actions";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export function MilestoneModal({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const inputId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const { notify } = useOrbitToast();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setTimeout(() => inputRef.current?.focus(), 20);
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Add milestone to ${projectTitle}`}
        className="btn btn-ghost btn-sm"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>Add milestone</span>
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title="Add milestone"
        maxWidthClass="sm:max-w-md"
      >
        <p className="meta mb-2">{projectTitle}</p>
        <form
          ref={formRef}
          action={async (formData) => {
            await addMilestoneAction(formData);
            formRef.current?.reset();
            close();
            notify("Milestone added");
          }}
          className="space-y-3"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <fieldset className="fieldset">
            <label htmlFor={inputId} className="fieldset-legend">
              Milestone title
            </label>
            <input
              ref={inputRef}
              id={inputId}
              name="title"
              type="text"
              required
              autoComplete="off"
              placeholder="Complete integration test"
              className="input w-full"
            />
          </fieldset>

          <div className="modal-action">
            <button type="button" onClick={close} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton pendingLabel="Adding">Add milestone</SubmitButton>
          </div>
        </form>
      </OrbitModal>
    </>
  );
}
