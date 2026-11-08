"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface OrbitModalProps {
  dialogRef?: React.RefObject<HTMLDialogElement | null>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  headerExtra?: React.ReactNode;
  maxWidthClass?: string;
  children: React.ReactNode;
}

/**
 * Modern OrbitSheet / OrbitModal component powered by Shadcn Sheet:
 * - Fluid animated bottom-sheet presentation on mobile and desktop
 * - Drag-handle pill indicator
 * - Backdrop blur with smooth fade
 * - Zero jank / lag on enter and exit
 * - Full backward-compatibility with existing ref.showModal() & ref.close() calls
 */
export function OrbitModal({
  dialogRef,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  title,
  headerExtra,
  maxWidthClass = "max-w-xl",
  children,
}: OrbitModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (setControlledOpen) {
        setControlledOpen(nextOpen);
      } else {
        setInternalOpen(nextOpen);
      }
    },
    [setControlledOpen]
  );

  useEffect(() => {
    if (!dialogRef) return;
    const mock = {
      get open() {
        return isOpen;
      },
      showModal: () => handleOpenChange(true),
      close: () => handleOpenChange(false),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as HTMLDialogElement;

    (dialogRef as React.MutableRefObject<HTMLDialogElement | null>).current = mock;
  }, [dialogRef, isOpen, handleOpenChange]);

  const cleanWidth = maxWidthClass
    ? maxWidthClass
        .replace(/\bsm:max-w-/g, "max-w-")
        .replace(/\bmax-w-md\b/, "max-w-lg")
    : "max-w-xl";

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "max-w-xl mx-auto sm:rounded-t-3xl max-h-[90vh] overflow-y-auto",
          cleanWidth
        )}
      >
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="text-lg font-semibold tracking-tight text-base-content">
              {title}
            </SheetTitle>
            {headerExtra}
          </div>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export const OrbitSheet = OrbitModal;

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
        <span
          className="loading loading-spinner loading-xs shrink-0"
          aria-hidden="true"
        />
      )}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
