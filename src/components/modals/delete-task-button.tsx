"use client";

import React, { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteTaskAction } from "@/app/actions/orbit-actions";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export function DeleteTaskButton({
  taskId,
  taskTitle,
  className = "btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error hover:bg-error/10 transition-colors",
}: {
  taskId: string;
  taskTitle: string;
  className?: string;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { notify } = useOrbitToast();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleting(true);
    try {
      const fd = new FormData();
      fd.append("taskId", taskId);
      await deleteTaskAction(fd);
      notify(`Deleted "${taskTitle}"`);
    } catch {
      notify("Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      disabled={isDeleting}
      onClick={handleDelete}
      aria-label={`Delete task ${taskTitle}`}
      title="Delete task"
      className={className}
    >
      {isDeleting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-error" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
