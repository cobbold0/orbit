"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { cycleMilestoneAction } from "@/app/actions/orbit-actions";
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
  const done = project.milestones.filter(
    (m) => m.status === "COMPLETED"
  ).length;
  const total = project.milestones.length;

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
            className="progress progress-primary h-1.5 w-full"
            value={done}
            max={total}
            aria-label={`${done} of ${total} milestones done`}
          />
          <ol className="mt-2">
            {project.milestones.map((ms) => (
              <li key={ms.id} className="orbit-row py-2.5">
                <p
                  className={`orbit-row-main ${
                    ms.status === "COMPLETED"
                      ? "text-[var(--text-3)] line-through"
                      : ms.status === "IN_PROGRESS"
                        ? "font-semibold"
                        : ""
                  }`}
                >
                  {ms.title}
                </p>
                <form
                  action={async (formData) => {
                    await cycleMilestoneAction(formData);
                    notify("Milestone updated");
                  }}
                >
                  <input type="hidden" name="milestoneId" value={ms.id} />
                  <button
                    type="submit"
                    aria-label={`${MILESTONE_LABEL[ms.status]} for ${ms.title}`}
                    className="btn btn-ghost btn-sm"
                  >
                    {ms.status === "COMPLETED" ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : ms.status === "IN_PROGRESS" ? (
                      <CircleDot className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Circle className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>{MILESTONE_LABEL[ms.status]}</span>
                  </button>
                </form>
              </li>
            ))}
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
