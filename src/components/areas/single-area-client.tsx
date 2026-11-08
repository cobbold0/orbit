"use client";

import React, { useState } from "react";
import { OpenCaptureButton } from "@/components/shell/orbit-shell";
import { Card } from "@/components/ui/page";
import {
  ProjectCard,
  type ProjectCardData,
} from "@/components/areas/project-card";
import {
  TasksCard,
  type AreaTaskRowItem,
} from "@/components/areas/tasks-card";
import {
  ProjectModal,
  type ProjectModalAreaOption,
} from "@/components/modals/project-modal";
import {
  CreateRoutineModal,
  EditRoutineModal,
  LogActivityModal,
} from "@/components/modals/activity-modals";

export interface SingleAreaRoutineItem {
  id: string;
  title: string;
  daysLabel: string;
  timeRangeLabel: string;
  physicalLocation: string | null;
  lifeAreaId?: string | null;
  kind?: string;
  daysOfWeek?: number[];
  startTimeLocal?: string;
  endTimeLocal?: string;
}

export interface SingleAreaActivityItem {
  id: string;
  title: string;
  whenLabel: string;
  durationLabel: string | null;
}

type AreaTab = "tasks" | "projects" | "routines";

export function SingleAreaClient({
  areaId,
  areaName,
  areaOptions,
  projects,
  tasks,
  routines,
  activities,
}: {
  areaId: string;
  areaName: string;
  areaOptions: ProjectModalAreaOption[];
  projects: ProjectCardData[];
  tasks: AreaTaskRowItem[];
  routines: SingleAreaRoutineItem[];
  activities: SingleAreaActivityItem[];
}) {
  const openTasksCount = tasks.filter((t) => t.status !== "COMPLETED").length;
  const [tab, setTab] = useState<AreaTab>("tasks");

  return (
    <div className="space-y-5">
      {/* Section switcher + contextual single action */}
      <div className="flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label={`${areaName} sections`}
          className="tabs tabs-box tabs-sm flex-nowrap [--tab-p:0.45rem] sm:[--tab-p:0.75rem]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "tasks"}
            onClick={() => setTab("tasks")}
            className={`tab whitespace-nowrap text-[0.8125rem] font-medium sm:text-sm ${
              tab === "tasks" ? "tab-active" : ""
            }`}
          >
            Tasks ({openTasksCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "projects"}
            onClick={() => setTab("projects")}
            className={`tab whitespace-nowrap text-[0.8125rem] font-medium sm:text-sm ${
              tab === "projects" ? "tab-active" : ""
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "routines"}
            onClick={() => setTab("routines")}
            className={`tab whitespace-nowrap text-[0.8125rem] font-medium sm:text-sm ${
              tab === "routines" ? "tab-active" : ""
            }`}
          >
            Routines
          </button>
        </div>

        <div className="shrink-0">
          {tab === "tasks" && (
            <OpenCaptureButton
              defaultAreaId={areaId}
              mode="task"
              label="New task"
              className="btn btn-primary btn-sm"
            />
          )}
          {tab === "projects" && (
            <ProjectModal
              mode="create"
              lifeAreas={areaOptions}
              defaultAreaId={areaId}
              triggerClassName="btn btn-primary btn-sm"
            />
          )}
          {tab === "routines" && (
            <CreateRoutineModal
              lifeAreas={areaOptions}
              defaultAreaId={areaId}
              triggerClassName="btn btn-primary btn-sm"
            />
          )}
        </div>
      </div>

      {tab === "tasks" && (
        <TasksCard tasks={tasks} showAreaLabel={false} />
      )}

      {tab === "projects" &&
        (projects.length === 0 ? (
          <Card title="No projects yet">
            <div className="orbit-row">
              <p className="meta orbit-row-main">
                Create a project or long-term journey inside {areaName}.
              </p>
              <ProjectModal
                mode="create"
                lifeAreas={areaOptions}
                defaultAreaId={areaId}
                triggerClassName="btn btn-secondary btn-sm"
              />
            </div>
          </Card>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                lifeAreas={areaOptions}
                showAreaLink={false}
              />
            ))}
          </div>
        ))}

      {tab === "routines" && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card title="Weekly routines">
            {routines.length === 0 ? (
              <p className="meta mt-2">
                No repeating weekly blocks set for {areaName}.
              </p>
            ) : (
              routines.map((r) => (
                <div key={r.id} className="orbit-row items-center justify-between">
                  <div className="orbit-row-main">
                    <p className="title">{r.title}</p>
                    <p className="meta flex flex-wrap gap-x-3">
                      <span>{r.daysLabel}</span>
                      <span className="tabular">{r.timeRangeLabel}</span>
                    </p>
                    {r.physicalLocation && (
                      <p className="meta-soft">{r.physicalLocation}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <EditRoutineModal
                      routine={{
                        id: r.id,
                        title: r.title,
                        lifeAreaId: r.lifeAreaId ?? areaId,
                        kind: r.kind,
                        daysOfWeek: r.daysOfWeek ?? [1, 2, 3, 4, 5],
                        startTimeLocal: r.startTimeLocal ?? "09:00",
                        endTimeLocal: r.endTimeLocal ?? "17:00",
                        physicalLocation: r.physicalLocation,
                      }}
                      lifeAreas={areaOptions}
                    />
                  </div>
                </div>
              ))
            )}
          </Card>

          <Card
            title="Work log"
            action={
              <LogActivityModal
                lifeAreas={areaOptions}
                defaultAreaId={areaId}
                triggerClassName="btn btn-secondary btn-sm"
              />
            }
          >
            {activities.length === 0 ? (
              <p className="meta mt-2">No work logged for {areaName} yet.</p>
            ) : (
              activities.map((act) => (
                <div key={act.id} className="orbit-row">
                  <div className="orbit-row-main">
                    <p className="title">{act.title}</p>
                    <p className="meta flex flex-wrap items-center gap-x-3">
                      <span className="tabular">{act.whenLabel}</span>
                      {act.durationLabel && <span>{act.durationLabel}</span>}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
