"use client";

import React, { useState } from "react";
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
 * ActionSubmitButton provides instant visual feedback and double-tap prevention
 * for Server Action forms.
 *
 * It immediately locks the button on click and displays a DaisyUI loading spinner,
 * staying disabled throughout React 19's `useFormStatus` pending lifecycle.
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
  const [clicked, setClicked] = useState(false);

  const isLocked = pending || clicked || disabled;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (isLocked) {
      e.preventDefault();
      return;
    }
    setClicked(true);
    onClick?.(e);
    // Safety unlock after 3s if request network errors out without unmounting
    setTimeout(() => {
      setClicked(false);
    }, 3000);
  }

  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      disabled={isLocked}
      onClick={handleClick}
      className={className}
    >
      {isLocked ? (
        <span
          className="loading loading-spinner loading-xs shrink-0"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {children && (
        <span>{isLocked && pendingLabel ? pendingLabel : children}</span>
      )}
    </button>
  );
}
