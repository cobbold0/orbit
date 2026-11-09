"use client";

import React from "react";
import { useFormStatus } from "react-dom";

export interface ActionSubmitButtonProps {
  children?: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * ActionSubmitButton provides visual feedback and prevents duplicate submissions
 * during React 19's Server Action lifecycle via `useFormStatus`.
 *
 * It does not prematurely disable the button during the native click event to avoid
 * browser cancellation of form submission.
 */
export function ActionSubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary btn-sm",
  disabled = false,
  icon,
  ariaLabel,
  onClick,
}: ActionSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isLocked = pending || disabled;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (isLocked) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  }

  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      disabled={isLocked}
      onClick={handleClick}
      className={className}
    >
      {pending ? (
        <span
          className="loading loading-spinner loading-xs shrink-0"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {children && (
        <span>{pending && pendingLabel ? pendingLabel : children}</span>
      )}
    </button>
  );
}
