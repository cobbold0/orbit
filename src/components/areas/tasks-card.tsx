"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AreaLabel, Card } from "@/components/ui/page";
import { RescheduleTaskModal } from "@/components/modals/reschedule-task-modal";
import { EditTaskModal } from "@/components/modals/edit-task-modal";
import { DeleteTaskButton } from "@/components/modals/delete-task-button";
import { CompleteTaskButton } from "@/components/modals/complete-task-button";
import { formatDuration } from "@/lib/time/format";

export interface AreaTaskRowItem {
  id: string;
  title: string;
  status: string;
  commitmentType: "SCHEDULED" | "FLEXIBLE" | "WAITING" | string;
  estimatedMinutes: number | null;
  waitingOnPerson: string | null;
  scheduledLabel?: string | null;
  projectTitle?: string | null;
  lifeAreaId?: string;
  priority?: string;
  notes?: string | null;
  lifeArea?: {
    id?: string;
    name: string;
    slug: string;
    colorToken: string;
  };
}

type TabFilter = "ALL" | "SCHEDULED" | "FLEXIBLE" | "WAITING";

export function TasksCard({
  tasks,
  lifeAreas,
  showAreaLabel = true,
  headerAction,
}: {
  tasks: AreaTaskRowItem[];
  lifeAreas?: { id: string; name: string }[];
  showAreaLabel?: boolean;
  headerAction?: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabFilter>("ALL");

  const openTasks = tasks.filter((t) => t.status !== "COMPLETED");
  const counts = {
    ALL: openTasks.length,
    SCHEDULED: openTasks.filter((t) => t.commitmentType === "SCHEDULED").length,
    FLEXIBLE: openTasks.filter((t) => t.commitmentType === "FLEXIBLE").length,
    WAITING: openTasks.filter((t) => t.commitmentType === "WAITING").length,
  };

  const visible =
    tab === "ALL"
      ? openTasks
      : openTasks.filter((t) => t.commitmentType === tab);

  const tabs: { id: TabFilter; label: string }[] = [
    { id: "ALL", label: `All (${counts.ALL})` },
    { id: "SCHEDULED", label: `Scheduled (${counts.SCHEDULED})` },
    { id: "FLEXIBLE", label: `Flexible (${counts.FLEXIBLE})` },
    { id: "WAITING", label: `Waiting (${counts.WAITING})` },
  ];

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Task commitment type"
          className="tabs tabs-box tabs-sm flex-1 bg-base-300/60 sm:flex-initial"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`tab flex-1 whitespace-nowrap text-[0.8125rem] font-medium [--tab-p:0.35rem] sm:flex-initial sm:text-sm sm:[--tab-p:0.625rem] ${
                tab === item.id ? "tab-active" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>

      {visible.length === 0 ? (
        <p className="meta mt-2">No open tasks in this view.</p>
      ) : (
        <div>
          {visible.map((task) => (
            <div key={task.id} className="orbit-row">
              <div className="orbit-row-main">
                <p className="title">{task.title}</p>
                <p className="meta flex flex-wrap items-center gap-x-3">
                  {showAreaLabel && task.lifeArea && (
                    <Link
                      href={`/areas/${task.lifeArea.slug}`}
                      className="hover:underline"
                    >
                      <AreaLabel
                        name={task.lifeArea.name}
                        token={task.lifeArea.colorToken}
                      />
                    </Link>
                  )}
                  {task.projectTitle && <span>{task.projectTitle}</span>}
                  {task.scheduledLabel && (
                    <span className="tabular">{task.scheduledLabel}</span>
                  )}
                  {task.estimatedMinutes && (
                    <span>{formatDuration(task.estimatedMinutes)}</span>
                  )}
                  {task.waitingOnPerson && (
                    <span>Waiting on {task.waitingOnPerson}</span>
                  )}
                </p>
              </div>

              <div className="orbit-row-actions">
                <EditTaskModal
                  task={{
                    id: task.id,
                    title: task.title,
                    lifeAreaId: task.lifeAreaId ?? task.lifeArea?.id,
                    estimatedMinutes: task.estimatedMinutes,
                    priority: task.priority,
                    notes: task.notes,
                  }}
                  lifeAreas={lifeAreas}
                  triggerClassName="btn btn-ghost btn-sm btn-square"
                />
                <RescheduleTaskModal
                  taskId={task.id}
                  taskTitle={task.title}
                  commitmentType={task.commitmentType}
                  hideLabel={true}
                  triggerClassName="btn btn-ghost btn-sm btn-square"
                />
                <DeleteTaskButton
                  taskId={task.id}
                  taskTitle={task.title}
                  className="btn btn-ghost btn-sm btn-square text-error hover:bg-error/10"
                />
                <CompleteTaskButton
                  taskId={task.id}
                  taskTitle={task.title}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
