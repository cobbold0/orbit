"use client";

import React, { useEffect, useId } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";

interface OrbitModalProps {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  title: string;
  headerExtra?: React.ReactNode;
  maxWidthClass?: string;
  children: React.ReactNode;
}

/**
 * Reusable DaisyUI v5 responsive modal:
 * - Centered dialog on desktop (`sm:modal-middle`)
 * - Bottom-sheet presentation on mobile (`modal-bottom`)
 * - Native `<dialog>` opened with `showModal()` for top-layer focus management,
 *   Escape dismissal, focus restoration, and safe pointerdown+pointerup backdrop light-dismiss.
 */
export function OrbitModal({
  dialogRef,
  title,
  headerExtra,
  maxWidthClass = "sm:max-w-lg",
  children,
}: OrbitModalProps) {
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let pressedBackdrop = false;
    const onPointerDown = (event: PointerEvent) => {
      pressedBackdrop = event.target === dialog;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pressedBackdrop && event.target === dialog) {
        dialog.close();
      }
      pressedBackdrop = false;
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [dialogRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className="modal modal-bottom sm:modal-middle"
    >
      <div
        className={`modal-box bg-base-100 w-full p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:p-6 ${maxWidthClass}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={titleId} className="h2">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {headerExtra}
            <form method="dialog">
              <button
                type="submit"
                aria-label="Close dialog"
                className="btn btn-ghost btn-sm btn-circle"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Saving",
  className = "btn btn-primary",
  disabled = false,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={className}
    >
      {pending && (
        <span className="loading loading-spinner loading-xs" aria-hidden="true" />
      )}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
