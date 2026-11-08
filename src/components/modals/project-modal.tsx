"use client";

import React, { useId, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  createProjectAction,
  updateProjectAction,
} from "@/app/actions/orbit-actions";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface ProjectModalAreaOption {
  id: string;
  name: string;
}

export interface EditableProjectShape {
  id: string;
  title: string;
  description: string | null;
  lifeAreaId: string;
  kind: "PROJECT" | "JOURNEY";
}

interface ProjectModalProps {
  mode?: "create" | "edit";
  lifeAreas: ProjectModalAreaOption[];
  defaultAreaId?: string;
  project?: EditableProjectShape;
  triggerLabel?: string;
  triggerClassName?: string;
}

export function ProjectModal({
  mode = "create",
  lifeAreas,
  defaultAreaId,
  project,
  triggerLabel,
  triggerClassName,
}: ProjectModalProps) {
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const { notify } = useOrbitToast();

  const [kind, setKind] = useState<"PROJECT" | "JOURNEY">(
    project?.kind ?? "PROJECT"
  );

  const label = triggerLabel ?? (mode === "create" ? "New project" : "Edit");
  const buttonClass =
    triggerClassName ??
    (mode === "create" ? "btn btn-primary" : "btn btn-ghost btn-sm");

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setKind(project?.kind ?? "PROJECT");
    dialog.showModal();
    setTimeout(() => titleInputRef.current?.focus(), 20);
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={
          mode === "edit" && project ? `${label} ${project.title}` : undefined
        }
        className={buttonClass}
      >
        {mode === "create" ? (
          <Plus className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span>{label}</span>
      </button>

      <OrbitModal
        dialogRef={dialogRef}
        title={mode === "create" ? "New project" : "Edit project"}
        maxWidthClass="sm:max-w-lg"
      >
        <form
          ref={formRef}
          action={async (formData) => {
            if (mode === "create") {
              await createProjectAction(formData);
              formRef.current?.reset();
              close();
              notify("Project created");
            } else {
              const op = String(formData.get("operation") ?? "EDIT");
              await updateProjectAction(formData);
              close();
              notify(op === "ARCHIVE" ? "Project archived" : "Project updated");
            }
          }}
          className="space-y-3"
        >
          {mode === "edit" && project && (
            <input type="hidden" name="projectId" value={project.id} />
          )}

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
              defaultValue={project?.title ?? ""}
              placeholder="Q4 reporting rollout"
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
                defaultValue={
                  project?.lifeAreaId ?? defaultAreaId ?? lifeAreas[0]?.id ?? ""
                }
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
                    ["PROJECT", "Project"],
                    ["JOURNEY", "Journey"],
                  ] as const
                ).map(([val, text]) => (
                  <label key={val} className="tab flex-1 font-medium">
                    <input
                      type="radio"
                      name="kind"
                      value={val}
                      checked={kind === val}
                      onChange={() => setKind(val)}
                    />
                    {text}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-desc`} className="fieldset-legend">
              Description (optional)
            </label>
            <textarea
              id={`${idBase}-desc`}
              name="description"
              rows={2}
              defaultValue={project?.description ?? ""}
              className="textarea w-full"
            />
          </fieldset>

          {mode === "create" && (
            <fieldset className="fieldset">
              <label htmlFor={`${idBase}-ms`} className="fieldset-legend">
                Milestones, one per line (optional)
              </label>
              <textarea
                id={`${idBase}-ms`}
                name="milestonesRaw"
                rows={3}
                placeholder={"Finalise scope\nBuild first version\nReview with team"}
                className="textarea w-full"
              />
            </fieldset>
          )}

          <div
            className={`modal-action ${
              mode === "edit" ? "justify-between" : "justify-end"
            }`}
          >
            {mode === "edit" && (
              <SubmitButton
                name="operation"
                value="ARCHIVE"
                pendingLabel="Archiving"
                className="btn btn-ghost text-error"
              >
                Archive
              </SubmitButton>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={close} className="btn btn-ghost">
                Cancel
              </button>
              <SubmitButton
                name={mode === "edit" ? "operation" : undefined}
                value={mode === "edit" ? "EDIT" : undefined}
                pendingLabel={mode === "create" ? "Creating" : "Saving"}
              >
                {mode === "create" ? "Create project" : "Save changes"}
              </SubmitButton>
            </div>
          </div>
        </form>
      </OrbitModal>
    </>
  );
}
