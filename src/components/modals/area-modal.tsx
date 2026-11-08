"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  createLifeAreaAction,
  deleteLifeAreaAction,
  updateLifeAreaAction,
} from "@/app/actions/orbit-actions";
import {
  LIFE_AREA_ICON_OPTIONS,
  LIFE_AREA_STYLES,
  type LifeAreaColorToken,
} from "@/lib/design/tokens";
import { AreaDot, getAreaIconComponent } from "@/components/ui/page";
import { OrbitModal, SubmitButton } from "@/components/ui/orbit-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

const COLOR_OPTIONS = Object.values(LIFE_AREA_STYLES);

export interface EditableAreaShape {
  id: string;
  name: string;
  slug?: string;
  colorToken: string;
  iconName?: string | null;
  description?: string | null;
  isArchived?: boolean;
  projectCount?: number;
  openTaskCount?: number;
}

function IconPickerField({
  value,
  colorToken,
  onChange,
}: {
  value: string;
  colorToken: string;
  onChange: (iconName: string) => void;
}) {
  const style =
    colorToken in LIFE_AREA_STYLES
      ? LIFE_AREA_STYLES[colorToken as LifeAreaColorToken]
      : LIFE_AREA_STYLES.slate;

  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">Icon</legend>
      <div className="grid grid-cols-5 gap-1.5 pt-1 sm:grid-cols-7">
        {LIFE_AREA_ICON_OPTIONS.map((opt) => {
          const Icon = getAreaIconComponent(opt.name);
          const selected = value === opt.name;
          return (
            <label
              key={opt.name}
              aria-label={opt.label}
              className={`flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center transition-colors ${
                selected
                  ? `${style.badgeBgClass} ${style.badgeTextClass} border-base-content/40 font-semibold`
                  : "border-base-300 bg-base-100 text-[var(--text-2)] hover:bg-base-200"
              }`}
            >
              <input
                type="radio"
                name="iconName"
                value={opt.name}
                checked={selected}
                onChange={() => onChange(opt.name)}
                className="visually-hidden"
              />
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="max-w-full truncate text-[0.6875rem] leading-tight">
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ColorPickerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (token: LifeAreaColorToken) => void;
}) {
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">Colour</legend>
      <div className="flex flex-wrap gap-2 pt-1">
        {COLOR_OPTIONS.map((style) => {
          const selected = value === style.token;
          return (
            <label
              key={style.token}
              className={`btn btn-sm cursor-pointer ${
                selected ? "btn-neutral" : "btn-secondary"
              }`}
            >
              <input
                type="radio"
                name="colorToken"
                value={style.token}
                checked={selected}
                onChange={() => onChange(style.token)}
                className="visually-hidden"
              />
              <AreaDot token={style.token} />
              <span>{style.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CreateAreaModal({
  triggerLabel = "New area",
  triggerClassName = "btn btn-primary btn-sm sm:btn-md",
}: {
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const idBase = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [color, setColor] = useState<LifeAreaColorToken>("teal");
  const [iconName, setIconName] = useState<string>("Briefcase");
  const { notify } = useOrbitToast();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setTimeout(() => nameRef.current?.focus(), 20);
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
        title="New area"
        maxWidthClass="sm:max-w-lg"
      >
        <form
          ref={formRef}
          action={async (formData) => {
            await createLifeAreaAction(formData);
            formRef.current?.reset();
            setColor("teal");
            setIconName("Briefcase");
            close();
            notify("Area created");
          }}
          className="space-y-3"
        >
          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-name`} className="fieldset-legend">
              Name
            </label>
            <input
              ref={nameRef}
              id={`${idBase}-name`}
              name="name"
              type="text"
              required
              autoComplete="off"
              placeholder="Health, Side projects, Family"
              className="input w-full"
            />
          </fieldset>

          <IconPickerField
            value={iconName}
            colorToken={color}
            onChange={setIconName}
          />

          <ColorPickerField value={color} onChange={setColor} />

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-desc`} className="fieldset-legend">
              Description (optional)
            </label>
            <textarea
              id={`${idBase}-desc`}
              name="description"
              rows={2}
              placeholder="Short summary of what belongs in this area"
              className="textarea w-full"
            />
          </fieldset>

          <div className="modal-action">
            <button type="button" onClick={close} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton pendingLabel="Creating">Create area</SubmitButton>
          </div>
        </form>
      </OrbitModal>
    </>
  );
}

export function EditAreaDialog({
  dialogRef,
  nameRef,
  area,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  nameRef?: React.RefObject<HTMLInputElement | null>;
  area: EditableAreaShape | null;
}) {
  const idBase = useId();
  const internalNameRef = useRef<HTMLInputElement | null>(null);
  const resolvedNameRef = nameRef ?? internalNameRef;
  const [color, setColor] = useState<string>(area?.colorToken || "slate");
  const [iconName, setIconName] = useState<string>(
    area?.iconName || "CircleDot"
  );
  const { notify } = useOrbitToast();

  useEffect(() => {
    if (area) {
      setColor(area.colorToken || "slate");
      setIconName(area.iconName || "CircleDot");
    }
  }, [area]);

  function close() {
    dialogRef.current?.close();
  }

  return (
    <OrbitModal
      dialogRef={dialogRef}
      title="Edit area"
      maxWidthClass="sm:max-w-lg"
    >
      {area && (
        <form
          key={area.id}
          action={async (formData) => {
            await updateLifeAreaAction(formData);
            close();
            notify("Area updated");
          }}
          className="space-y-3"
        >
          <input type="hidden" name="areaId" value={area.id} />
          <input type="hidden" name="operation" value="EDIT" />

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-name`} className="fieldset-legend">
              Name
            </label>
            <input
              ref={resolvedNameRef}
              id={`${idBase}-name`}
              name="name"
              type="text"
              required
              autoComplete="off"
              defaultValue={area.name}
              className="input w-full"
            />
          </fieldset>

          <IconPickerField
            value={iconName}
            colorToken={color}
            onChange={setIconName}
          />

          <ColorPickerField
            value={color}
            onChange={(next) => setColor(next)}
          />

          <fieldset className="fieldset">
            <label htmlFor={`${idBase}-desc`} className="fieldset-legend">
              Description (optional)
            </label>
            <textarea
              id={`${idBase}-desc`}
              name="description"
              rows={2}
              defaultValue={area.description ?? ""}
              className="textarea w-full"
            />
          </fieldset>

          <div className="modal-action">
            <button type="button" onClick={close} className="btn btn-ghost">
              Cancel
            </button>
            <SubmitButton pendingLabel="Saving">Save changes</SubmitButton>
          </div>
        </form>
      )}
    </OrbitModal>
  );
}

export function EditAreaModal({
  area,
  triggerLabel = "Edit",
  triggerClassName = "btn btn-secondary btn-sm",
}: {
  area: EditableAreaShape;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  function open() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setTimeout(() => nameRef.current?.focus(), 20);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`${triggerLabel} ${area.name}`}
        className={triggerClassName}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{triggerLabel}</span>
      </button>
      <EditAreaDialog dialogRef={dialogRef} nameRef={nameRef} area={area} />
    </>
  );
}

export function ArchiveAreaDialog({
  dialogRef,
  cancelRef,
  area,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  cancelRef?: React.RefObject<HTMLButtonElement | null>;
  area: EditableAreaShape | null;
}) {
  const internalCancelRef = useRef<HTMLButtonElement | null>(null);
  const resolvedCancelRef = cancelRef ?? internalCancelRef;
  const { notify } = useOrbitToast();

  function close() {
    dialogRef.current?.close();
  }

  return (
    <OrbitModal
      dialogRef={dialogRef}
      title={area ? `Archive ${area.name}?` : "Archive area?"}
      maxWidthClass="sm:max-w-md"
    >
      {area && (
        <>
          <p className="meta">
            Projects, tasks, and activity history stay intact, and you can
            restore {area.name} whenever you need it.
          </p>

          <form
            action={async (formData) => {
              await updateLifeAreaAction(formData);
              close();
              notify(`${area.name} archived`);
            }}
            className="modal-action"
          >
            <input type="hidden" name="areaId" value={area.id} />
            <input type="hidden" name="operation" value="ARCHIVE" />
            <button
              ref={resolvedCancelRef}
              type="button"
              onClick={close}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <SubmitButton pendingLabel="Archiving" className="btn btn-primary">
              Archive area
            </SubmitButton>
          </form>
        </>
      )}
    </OrbitModal>
  );
}

export function DeleteAreaDialog({
  dialogRef,
  cancelRef,
  area,
  redirectOnDeleteTo,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  cancelRef?: React.RefObject<HTMLButtonElement | null>;
  area: EditableAreaShape | null;
  redirectOnDeleteTo?: string;
}) {
  const router = useRouter();
  const internalCancelRef = useRef<HTMLButtonElement | null>(null);
  const resolvedCancelRef = cancelRef ?? internalCancelRef;
  const [error, setError] = useState<string | null>(null);
  const { notify } = useOrbitToast();

  useEffect(() => {
    setError(null);
  }, [area]);

  function close() {
    setError(null);
    dialogRef.current?.close();
  }

  const pCount = area?.projectCount ?? 0;
  const tCount = area?.openTaskCount ?? 0;

  return (
    <OrbitModal
      dialogRef={dialogRef}
      title={area ? `Delete ${area.name}?` : "Delete area?"}
      maxWidthClass="sm:max-w-md"
    >
      {area && (
        <>
          <p className="meta">
            {pCount > 0 || tCount > 0
              ? `This permanently deletes ${area.name} along with its ${pCount} ${
                  pCount === 1 ? "project" : "projects"
                } and ${tCount} open ${
                  tCount === 1 ? "task" : "tasks"
                }. To hide it without losing history, archive it instead.`
              : `This permanently deletes ${area.name}. This action cannot be undone.`}
          </p>

          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-error">
              {error}
            </p>
          )}

          <div className="modal-action flex-wrap justify-between gap-2">
            {!area.isArchived ? (
              <form
                action={async (formData) => {
                  await updateLifeAreaAction(formData);
                  close();
                  notify(`${area.name} archived`);
                }}
              >
                <input type="hidden" name="areaId" value={area.id} />
                <input type="hidden" name="operation" value="ARCHIVE" />
                <SubmitButton
                  pendingLabel="Archiving"
                  className="btn btn-ghost btn-sm"
                >
                  Archive instead
                </SubmitButton>
              </form>
            ) : (
              <span />
            )}

            <form
              action={async (formData) => {
                const res = await deleteLifeAreaAction(formData);
                if (!res.ok) {
                  setError(res.error ?? "Could not delete area.");
                  return;
                }
                close();
                notify(`${area.name} deleted`);
                if (redirectOnDeleteTo) {
                  router.push(redirectOnDeleteTo);
                }
              }}
              className="flex items-center gap-2"
            >
              <input type="hidden" name="areaId" value={area.id} />
              <button
                ref={resolvedCancelRef}
                type="button"
                onClick={close}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <SubmitButton
                pendingLabel="Deleting"
                className="btn btn-error text-white"
              >
                Delete
              </SubmitButton>
            </form>
          </div>
        </>
      )}
    </OrbitModal>
  );
}

/**
 * Accessible three-dots (`⋮`) action menu for a Life Area card or header.
 * Supports keyboard arrow navigation, Escape close with focus restoration,
 * and opens top-layer `<dialog>` modals outside the menu container.
 */
export function AreaActionsMenu({
  area,
  includeEdit = true,
  redirectOnDeleteTo,
}: {
  area: EditableAreaShape;
  includeEdit?: boolean;
  redirectOnDeleteTo?: string;
}) {
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const editDialogRef = useRef<HTMLDialogElement | null>(null);
  const editNameRef = useRef<HTMLInputElement | null>(null);
  const archiveDialogRef = useRef<HTMLDialogElement | null>(null);
  const archiveCancelRef = useRef<HTMLButtonElement | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);

  const [open, setOpen] = useState(false);
  const { notify } = useOrbitToast();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  function focusMenuItem(index: number) {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)"
    );
    if (!items || items.length === 0) return;
    const clamped = ((index % items.length) + items.length) % items.length;
    items[clamped]?.focus({ preventScroll: true });
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  async function handleRestore() {
    setOpen(false);
    const fd = new FormData();
    fd.set("areaId", area.id);
    fd.set("operation", "RESTORE");
    await updateLifeAreaAction(fd);
    notify(`${area.name} restored`);
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`More options for ${area.name}`}
          onClick={(e) => {
            e.stopPropagation();
            const next = !open;
            setOpen(next);
            if (next && e.detail === 0) {
              setTimeout(() => focusMenuItem(0), 10);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setTimeout(() => focusMenuItem(0), 10);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              closeMenu(true);
            }
          }}
          className="btn btn-ghost btn-sm btn-square"
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        {open && (
          <div
            ref={menuRef}
            {...({ focusgroup: "menu nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
            role="menu"
            aria-labelledby={triggerId}
            onKeyDown={(e) => {
              const items = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)"
                ) ?? []
              );
              const idx = items.indexOf(
                document.activeElement as HTMLButtonElement
              );
              if (e.key === "ArrowDown") {
                e.preventDefault();
                focusMenuItem(idx + 1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                focusMenuItem(idx <= 0 ? items.length - 1 : idx - 1);
              } else if (e.key === "Home") {
                e.preventDefault();
                focusMenuItem(0);
              } else if (e.key === "End") {
                e.preventDefault();
                focusMenuItem(items.length - 1);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeMenu(true);
              }
            }}
            className="absolute end-0 top-full z-30 mt-1 flex w-44 flex-col rounded-2xl border border-base-300 bg-base-100 p-1.5 shadow-lg"
          >
            {includeEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  editDialogRef.current?.showModal();
                  setTimeout(() => editNameRef.current?.focus(), 20);
                }}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[0.9375rem] font-medium hover:bg-base-200 focus-visible:bg-base-200"
              >
                <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Edit</span>
              </button>
            )}

            {area.isArchived ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleRestore()}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[0.9375rem] font-medium hover:bg-base-200 focus-visible:bg-base-200"
              >
                <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Restore</span>
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  archiveDialogRef.current?.showModal();
                  setTimeout(() => archiveCancelRef.current?.focus(), 20);
                }}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[0.9375rem] font-medium hover:bg-base-200 focus-visible:bg-base-200"
              >
                <Archive className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Archive</span>
              </button>
            )}

            <hr className="my-1 border-base-300" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                deleteDialogRef.current?.showModal();
                setTimeout(() => deleteCancelRef.current?.focus(), 20);
              }}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[0.9375rem] font-medium text-error hover:bg-error/10 focus-visible:bg-error/10"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>

      {includeEdit && (
        <EditAreaDialog
          dialogRef={editDialogRef}
          nameRef={editNameRef}
          area={area}
        />
      )}
      <ArchiveAreaDialog
        dialogRef={archiveDialogRef}
        cancelRef={archiveCancelRef}
        area={area}
      />
      <DeleteAreaDialog
        dialogRef={deleteDialogRef}
        cancelRef={deleteCancelRef}
        area={area}
        redirectOnDeleteTo={redirectOnDeleteTo}
      />
    </>
  );
}
