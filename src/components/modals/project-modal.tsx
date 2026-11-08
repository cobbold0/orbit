"use client";

import React, { useId, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  addMilestoneAction,
  createProjectAction,
  deleteMilestoneAction,
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
  milestones?: {
    id: string;
    title: string;
    status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  }[];
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
  const [milestones, setMilestones] = useState<
    { id: string; title: string; status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED" }[]
  >(project?.milestones ?? []);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [isAddingMilestone, setIsAddingMilestone] = useState(false);
  const [deletingMilestoneId, setDeletingMilestoneId] = useState<string | null>(null);

  const label = triggerLabel ?? (mode === "create" ? "New project" : "Edit");
  const buttonClass =
    triggerClassName ??
    (mode === "create" ? "btn btn-primary" : "btn btn-ghost btn-sm");

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setKind(project?.kind ?? "PROJECT");
    setMilestones(project?.milestones ?? []);
    setNewMilestoneTitle("");
    dialog.showModal();
    setTimeout(() => titleInputRef.current?.focus(), 20);
  }

  async function handleAddMilestone() {
    if (!project || !newMilestoneTitle.trim() || isAddingMilestone) return;
    setIsAddingMilestone(true);
    const titleToAdd = newMilestoneTitle.trim();
    try {
      const fd = new FormData();
      fd.append("projectId", project.id);
      fd.append("title", titleToAdd);
      await addMilestoneAction(fd);
      setMilestones((prev) => [
        ...prev,
        {
          id: `temp_${Date.now()}`,
          title: titleToAdd,
          status: "UPCOMING",
        },
      ]);
      setNewMilestoneTitle("");
      notify("Milestone added");
    } finally {
      setIsAddingMilestone(false);
    }
  }

  async function handleDeleteMilestone(milestoneId: string) {
    if (deletingMilestoneId) return;
    setDeletingMilestoneId(milestoneId);
    try {
      const fd = new FormData();
      fd.append("milestoneId", milestoneId);
      await deleteMilestoneAction(fd);
      setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));
      notify("Milestone removed");
    } finally {
      setDeletingMilestoneId(null);
    }
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

          {mode === "create" ? (
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
          ) : (
            <fieldset className="fieldset">
              <legend className="fieldset-legend flex items-center justify-between w-full">
                <span>Milestones ({milestones.length})</span>
                <span className="text-xs text-base-content/50 font-normal">
                  Remove or add milestones
                </span>
              </legend>

              {milestones.length === 0 ? (
                <p className="text-xs text-base-content/50 italic py-1">
                  No milestones for this project yet.
                </p>
              ) : (
                <ul className="space-y-1.5 max-h-48 overflow-y-auto py-1">
                  {milestones.map((ms) => {
                    const isDeletingThis = deletingMilestoneId === ms.id;
                    return (
                      <li
                        key={ms.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-base-200/50 border border-base-300/70 text-sm"
                      >
                        <span
                          className={`flex-1 truncate ${
                            ms.status === "COMPLETED"
                              ? "line-through text-base-content/50"
                              : "text-base-content font-medium"
                          }`}
                        >
                          {ms.title}
                        </span>
                        <button
                          type="button"
                          disabled={isDeletingThis}
                          onClick={() => handleDeleteMilestone(ms.id)}
                          aria-label={`Remove milestone ${ms.title}`}
                          className="btn btn-ghost btn-xs text-error hover:bg-error/10 px-1.5 h-7 min-h-7"
                        >
                          {isDeletingThis ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Add milestone inline row */}
              <div className="flex items-center gap-2 pt-1.5">
                <input
                  type="text"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddMilestone();
                    }
                  }}
                  placeholder="New milestone..."
                  className="input input-sm flex-1"
                />
                <button
                  type="button"
                  onClick={() => void handleAddMilestone()}
                  disabled={!newMilestoneTitle.trim() || isAddingMilestone}
                  className="btn btn-secondary btn-sm gap-1 shrink-0"
                >
                  {isAddingMilestone ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>Add</span>
                </button>
              </div>
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
