"use client";

import React, { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { completeTaskAction } from "@/app/actions/orbit-actions";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface CompleteTaskButtonProps {
  taskId: string;
  taskTitle: string;
  className?: string;
  label?: string;
  ariaLabel?: string;
  onCompleted?: () => void;
}

export function CompleteTaskButton({
  taskId,
  taskTitle,
  className = "btn btn-ghost btn-sm btn-square text-success hover:bg-success/10 transition-colors",
  label,
  ariaLabel,
  onCompleted,
}: CompleteTaskButtonProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const { notify } = useOrbitToast();

  async function handleComplete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (isCompleting) return;
    setIsCompleting(true);

    try {
      const fd = new FormData();
      fd.append("taskId", taskId);
      await completeTaskAction(fd);
      notify(`Marked "${taskTitle}" as done!`);
      onCompleted?.();
    } catch {
      notify("Failed to mark task complete");
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <button
      type="button"
      disabled={isCompleting}
      onClick={handleComplete}
      aria-label={ariaLabel ?? `Mark ${taskTitle} done`}
      title={ariaLabel ?? `Mark ${taskTitle} done`}
      className={className}
    >
      {isCompleting ? (
        <Loader2 className="h-4 w-4 animate-spin text-success" />
      ) : (
        <Check className="h-4 w-4" aria-hidden="true" />
      )}
      {label && <span>{label}</span>}
    </button>
  );
}
