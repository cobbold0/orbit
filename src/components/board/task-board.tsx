"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Sparkles,
  Hourglass,
  Play,
  LayoutGrid,
  ChevronRight,
} from "lucide-react";
import { AreaLabel } from "@/components/ui/page";
import { CompleteTaskButton } from "@/components/modals/complete-task-button";
import {
  moveTaskLaneAction,
  startTaskAction,
} from "@/app/actions/orbit-actions";

import type { CommitmentType, TaskStatus } from "@prisma/client";

export interface BoardTaskItem {
  id: string;
  title: string;
  commitmentType: CommitmentType;
  status: TaskStatus;
  lifeArea: {
    id: string;
    name: string;
    slug: string;
    colorToken: string;
  };
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  estimatedMinutes?: number | null;
  waitingOnPerson?: string | null;
  waitingOnCondition?: string | null;
  timeLabel?: string;
  isCurrentFocus?: boolean;
}

interface TaskBoardProps {
  tasks: {
    scheduledToday: BoardTaskItem[];
    flexible: BoardTaskItem[];
    waiting: BoardTaskItem[];
    completedToday?: BoardTaskItem[];
  };
  timeZone: string;
}

type LaneId = "today" | "flexible" | "waiting" | "done";

export function TaskBoard({ tasks }: TaskBoardProps) {
  const [activeLane, setActiveLane] = useState<LaneId | "all">("all");

  const lanes = [
    {
      id: "today" as const,
      label: "Today & Focus",
      icon: Clock,
      badgeClass: "badge-primary",
      tasks: tasks.scheduledToday,
      description: "Scheduled commitments & active focus",
    },
    {
      id: "flexible" as const,
      label: "Flexible Queue",
      icon: Sparkles,
      badgeClass: "badge-neutral",
      tasks: tasks.flexible,
      description: "Ready to pick up whenever you want",
    },
    {
      id: "waiting" as const,
      label: "Waiting On",
      icon: Hourglass,
      badgeClass: "badge-warning",
      tasks: tasks.waiting,
      description: "Pending responses & external dependencies",
    },
    {
      id: "done" as const,
      label: "Completed Today",
      icon: CheckCircle2,
      badgeClass: "badge-success",
      tasks: tasks.completedToday ?? [],
      description: "Accomplishments finished today",
    },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Board Navigation Filter (Mobile friendly and compact) */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveLane("all")}
            className={`btn btn-xs sm:btn-sm rounded-lg font-medium transition-all ${
              activeLane === "all"
                ? "btn-neutral shadow-xs"
                : "btn-ghost text-base-content/70"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1" />
            All Lanes
          </button>
          {lanes.map((lane) => (
            <button
              key={lane.id}
              type="button"
              onClick={() => setActiveLane(lane.id)}
              className={`btn btn-xs sm:btn-sm rounded-lg font-medium transition-all ${
                activeLane === lane.id
                  ? "btn-neutral shadow-xs"
                  : "btn-ghost text-base-content/70"
              }`}
            >
              <span>{lane.label}</span>
              <span className={`badge badge-xs ml-1 ${lane.badgeClass}`}>
                {lane.tasks.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Lanes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {lanes
          .filter((lane) => activeLane === "all" || activeLane === lane.id)
          .map((lane) => {
            const Icon = lane.icon;
            return (
              <div
                key={lane.id}
                className="flex flex-col rounded-2xl bg-base-100 border border-base-300/60 shadow-xs overflow-hidden"
              >
                {/* Lane Header */}
                <div className="p-3.5 border-b border-base-200/80 bg-base-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-base-200/70 text-base-content/80">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-base-content tracking-tight">
                        {lane.label}
                      </h2>
                    </div>
                  </div>
                  <span className={`badge badge-sm font-semibold ${lane.badgeClass}`}>
                    {lane.tasks.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="p-2.5 space-y-2.5 min-h-[140px] max-h-[580px] overflow-y-auto">
                  {lane.tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center text-base-content/40">
                      <p className="text-xs">No tasks in this lane</p>
                    </div>
                  ) : (
                    lane.tasks.map((task) => (
                      <div
                        key={task.id}
                        className={`group relative flex flex-col gap-2 rounded-xl border p-3 transition-all hover:shadow-xs bg-base-100 ${
                          task.isCurrentFocus
                            ? "border-primary/60 ring-1 ring-primary/30"
                            : "border-base-300/70 hover:border-base-content/30"
                        }`}
                      >
                        {/* Top Row: Area Tag & Actions */}
                        <div className="flex items-center justify-between gap-1.5">
                          <Link
                            href={`/areas/${task.lifeArea.slug}`}
                            className="hover:underline"
                          >
                            <AreaLabel
                              name={task.lifeArea.name}
                              token={task.lifeArea.colorToken}
                            />
                          </Link>

                          {task.status !== "COMPLETED" && (
                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                              <CompleteTaskButton
                                taskId={task.id}
                                taskTitle={task.title}
                                className="btn btn-ghost btn-xs btn-square text-success hover:bg-success/10"
                                label=""
                              />
                            </div>
                          )}
                        </div>

                        {/* Title */}
                        <div className="text-sm font-medium text-base-content leading-snug">
                          <span
                            className={
                              task.status === "COMPLETED"
                                ? "line-through text-base-content/50"
                                : ""
                            }
                          >
                            {task.title}
                          </span>
                        </div>

                        {/* Timing / Waiting Metadata */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-base-content/60">
                          {task.timeLabel && (
                            <span className="badge badge-xs badge-neutral gap-1 tabular font-medium py-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              <span>{task.timeLabel}</span>
                            </span>
                          )}
                          {task.estimatedMinutes && !task.timeLabel && (
                            <span className="badge badge-xs badge-ghost gap-1 tabular">
                              <span>{task.estimatedMinutes}m</span>
                            </span>
                          )}
                          {task.isCurrentFocus && (
                            <span className="badge badge-xs badge-primary font-semibold">
                              Now in focus
                            </span>
                          )}
                          {task.waitingOnPerson && (
                            <span className="badge badge-xs badge-warning gap-1">
                              <span>Waiting: {task.waitingOnPerson}</span>
                            </span>
                          )}
                        </div>

                        {/* Lane Shifting Controls */}
                        {task.status !== "COMPLETED" && (
                          <div className="pt-2 border-t border-base-200/70 flex items-center justify-between gap-1 text-xs">
                            {lane.id !== "today" && (
                              <form action={startTaskAction}>
                                <input type="hidden" name="taskId" value={task.id} />
                                <button
                                  type="submit"
                                  className="btn btn-ghost btn-xs text-primary gap-1 px-1.5"
                                  title="Focus on this task now"
                                >
                                  <Play className="h-3 w-3" />
                                  <span>Focus</span>
                                </button>
                              </form>
                            )}

                            <div className="dropdown dropdown-top dropdown-end ml-auto">
                              <div
                                tabIndex={0}
                                role="button"
                                className="btn btn-ghost btn-xs btn-square text-base-content/60"
                                title="Move to another lane"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </div>
                              <ul
                                tabIndex={0}
                                className="dropdown-content menu bg-base-100 rounded-box z-10 w-44 p-1.5 shadow-md border border-base-300 text-xs"
                              >
                                {lane.id !== "today" && (
                                  <li>
                                    <form action={moveTaskLaneAction}>
                                      <input
                                        type="hidden"
                                        name="taskId"
                                        value={task.id}
                                      />
                                      <input
                                        type="hidden"
                                        name="targetLane"
                                        value="TODAY"
                                      />
                                      <button type="submit" className="w-full text-left">
                                        Move to Today
                                      </button>
                                    </form>
                                  </li>
                                )}
                                {lane.id !== "flexible" && (
                                  <li>
                                    <form action={moveTaskLaneAction}>
                                      <input
                                        type="hidden"
                                        name="taskId"
                                        value={task.id}
                                      />
                                      <input
                                        type="hidden"
                                        name="targetLane"
                                        value="FLEXIBLE"
                                      />
                                      <button type="submit" className="w-full text-left">
                                        Make Flexible
                                      </button>
                                    </form>
                                  </li>
                                )}
                                {lane.id !== "waiting" && (
                                  <li>
                                    <form action={moveTaskLaneAction}>
                                      <input
                                        type="hidden"
                                        name="taskId"
                                        value={task.id}
                                      />
                                      <input
                                        type="hidden"
                                        name="targetLane"
                                        value="WAITING"
                                      />
                                      <button type="submit" className="w-full text-left">
                                        Move to Waiting
                                      </button>
                                    </form>
                                  </li>
                                )}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
