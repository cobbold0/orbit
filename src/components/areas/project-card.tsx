"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, Loader2, Trash2 } from "lucide-react";
import {
  cycleMilestoneAction,
  deleteMilestoneAction,
} from "@/app/actions/orbit-actions";
import { AreaLabel, Card } from "@/components/ui/page";
import { MilestoneModal } from "@/components/modals/milestone-modal";
import {
  ProjectModal,
  type ProjectModalAreaOption,
} from "@/components/modals/project-modal";
import { useOrbitToast } from "@/components/ui/orbit-toast";

const MILESTONE_LABEL = {
  UPCOMING: "Upcoming",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
} as const;

export interface ProjectCardData {
  id: string;
  title: string;
  description: string | null;
  kind: "PROJECT" | "JOURNEY";
  lifeAreaId: string;
  lifeArea?: {
    name: string;
    slug: string;
    colorToken: string;
  };
  milestones: {
    id: string;
    title: string;
    status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  }[];
}

export function ProjectCard({
  project,
  lifeAreas,
  showAreaLink = true,
}: {
  project: ProjectCardData;
  lifeAreas: ProjectModalAreaOption[];
  showAreaLink?: boolean;
}) {
  const { notify } = useOrbitToast();
  const [milestoneStatuses, setMilestoneStatuses] = useState<
    Record<string, "UPCOMING" | "IN_PROGRESS" | "COMPLETED">
  >(() => Object.fromEntries(project.milestones.map((m) => [m.id, m.status])));
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Sync when prop updates
  useEffect(() => {
    setMilestoneStatuses(
      Object.fromEntries(project.milestones.map((m) => [m.id, m.status]))
    );
  }, [project.milestones]);

  const activeMilestones = project.milestones.filter(
    (m) => !deletedIds.has(m.id)
  );

  const done = activeMilestones.filter(
    (m) => (milestoneStatuses[m.id] ?? m.status) === "COMPLETED"
  ).length;
  const total = activeMilestones.length;

  async function handleCycle(milestoneId: string) {
    const currentStatus =
      milestoneStatuses[milestoneId] ??
      project.milestones.find((m) => m.id === milestoneId)?.status ??
      "UPCOMING";
    const nextStatus =
      currentStatus === "UPCOMING"
        ? "IN_PROGRESS"
        : currentStatus === "IN_PROGRESS"
        ? "COMPLETED"
        : "UPCOMING";

    // Immediate optimistic update
    setMilestoneStatuses((prev) => ({ ...prev, [milestoneId]: nextStatus }));
    setPendingIds((prev) => new Set(prev).add(milestoneId));

    try {
      const fd = new FormData();
      fd.append("milestoneId", milestoneId);
      await cycleMilestoneAction(fd);
      notify(`Milestone set to ${MILESTONE_LABEL[nextStatus].toLowerCase()}`);
    } catch {
      // Revert on error
      setMilestoneStatuses((prev) => ({ ...prev, [milestoneId]: currentStatus }));
      notify("Failed to update milestone");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(milestoneId);
        return next;
      });
    }
  }

  async function handleDelete(milestoneId: string, title: string) {
    if (!confirm(`Remove milestone "${title}"?`)) return;
    setDeletedIds((prev) => new Set(prev).add(milestoneId));
    try {
      const fd = new FormData();
      fd.append("milestoneId", milestoneId);
      await deleteMilestoneAction(fd);
      notify("Milestone removed");
    } catch {
      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(milestoneId);
        return next;
      });
      notify("Failed to remove milestone");
    }
  }

  return (
    <Card
      title={project.title}
      action={
        <ProjectModal
          mode="edit"
          lifeAreas={lifeAreas}
          project={{
            id: project.id,
            title: project.title,
            description: project.description,
            lifeAreaId: project.lifeAreaId,
            kind: project.kind,
            milestones: activeMilestones.map((m) => ({
              id: m.id,
              title: m.title,
              status: milestoneStatuses[m.id] ?? m.status,
            })),
          }}
        />
      }
    >
      <p className="meta flex flex-wrap items-center gap-x-3">
        {showAreaLink && project.lifeArea && (
          <Link
            href={`/areas/${project.lifeArea.slug}`}
            className="hover:underline"
          >
            <AreaLabel
              name={project.lifeArea.name}
              token={project.lifeArea.colorToken}
            />
          </Link>
        )}
        <span>{project.kind === "JOURNEY" ? "Journey" : "Project"}</span>
      </p>

      {project.description && (
        <p className="mt-2.5 text-[0.9375rem] text-[var(--text-2)]">
          {project.description}
        </p>
      )}

      {total > 0 && (
        <div className="mt-4">
          <div className="meta mb-1.5 flex items-center justify-between">
            <span>Milestones</span>
            <span className="tabular">
              {done} of {total}
            </span>
          </div>
          <progress
            className="progress progress-primary h-1.5 w-full transition-all duration-300"
            value={done}
            max={total}
            aria-label={`${done} of ${total} milestones done`}
          />
          <ol className="mt-2 divide-y divide-base-200/60">
            {activeMilestones.map((ms) => {
              const status = milestoneStatuses[ms.id] ?? ms.status;
              const isPending = pendingIds.has(ms.id);

              return (
                <li
                  key={ms.id}
                  className="orbit-row py-2.5 flex items-center justify-between gap-2"
                >
                  <p
                    className={`orbit-row-main transition-all ${
                      status === "COMPLETED"
                        ? "text-[var(--text-3)] line-through"
                        : status === "IN_PROGRESS"
                        ? "font-semibold text-primary"
                        : ""
                    }`}
                  >
                    {ms.title}
                  </p>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCycle(ms.id)}
                      disabled={isPending}
                      aria-label={`${MILESTONE_LABEL[status]} for ${ms.title}`}
                      className={`btn btn-ghost btn-sm select-none active:scale-90 active:bg-primary/10 transition-all gap-1.5 ${
                        status === "COMPLETED"
                          ? "text-success font-semibold"
                          : status === "IN_PROGRESS"
                          ? "text-primary font-semibold"
                          : "text-base-content/70"
                      }`}
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : status === "COMPLETED" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : status === "IN_PROGRESS" ? (
                        <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" />
                      ) : (
                        <Circle className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>{MILESTONE_LABEL[status]}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDelete(ms.id, ms.title)}
                      aria-label={`Delete milestone ${ms.title}`}
                      title="Delete milestone"
                      className="btn btn-ghost btn-xs text-base-content/30 hover:text-error hover:bg-error/10 px-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="mt-3">
        <MilestoneModal
          projectId={project.id}
          projectTitle={project.title}
        />
      </div>
    </Card>
  );
}
