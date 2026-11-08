"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AreaLabel, Card, PageHeader } from "@/components/ui/page";
import {
  CreateRoutineModal,
  LogActivityModal,
  type ActivityAreaOption,
} from "@/components/modals/activity-modals";
import {
  resolveInferredActivityAction,
  resolveSuggestedRoutineAction,
} from "@/app/actions/orbit-actions";
import { useOrbitToast } from "@/components/ui/orbit-toast";

export interface AreaDistributionItem {
  lifeAreaId: string;
  name: string;
  slug?: string;
  colorToken: string;
  confirmedMinutes: number;
  confirmedLabel: string;
  inferredMinutes: number;
  inferredLabel: string;
}

export interface ActivityHistoryItem {
  id: string;
  title: string;
  whenLabel: string;
  durationLabel: string | null;
  isConfirmed: boolean;
  lifeArea: {
    name: string;
    colorToken: string;
  } | null;
}

export interface RoutineItem {
  id: string;
  title: string;
  daysLabel: string;
  timeRangeLabel: string;
  physicalLocation: string | null;
  suggestionReasoning?: string | null;
  lifeArea: {
    name: string;
    colorToken: string;
  } | null;
}

export function ActivityClient({
  areaOptions,
  distribution,
  history,
  declaredRoutines,
  suggestedRoutines,
}: {
  areaOptions: ActivityAreaOption[];
  distribution: AreaDistributionItem[];
  history: ActivityHistoryItem[];
  declaredRoutines: RoutineItem[];
  suggestedRoutines: RoutineItem[];
}) {
  const [tab, setTab] = useState<"log" | "routines">("log");
  const { notify } = useOrbitToast();

  const maxMinutes = Math.max(
    1,
    ...distribution.map((d) => d.confirmedMinutes)
  );

  return (
    <div className="page">
      <PageHeader title="Activity">
        {tab === "log" ? (
          <LogActivityModal
            lifeAreas={areaOptions}
            triggerClassName="btn btn-primary btn-sm sm:btn-md"
          />
        ) : (
          <CreateRoutineModal
            lifeAreas={areaOptions}
            triggerClassName="btn btn-primary btn-sm sm:btn-md"
          />
        )}
      </PageHeader>

      <div className="space-y-2">
        <div
          role="tablist"
          aria-label="Activity sections"
          className="tabs tabs-box tabs-sm w-full sm:w-auto sm:inline-flex"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "log"}
            onClick={() => setTab("log")}
            className={`tab flex-1 font-medium sm:flex-initial sm:px-5 ${
              tab === "log" ? "tab-active" : ""
            }`}
          >
            Work log
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "routines"}
            onClick={() => setTab("routines")}
            className={`tab flex-1 gap-2 font-medium sm:flex-initial sm:px-5 ${
              tab === "routines" ? "tab-active" : ""
            }`}
          >
            <span>Routines ({declaredRoutines.length})</span>
            {suggestedRoutines.length > 0 && (
              <span className="badge badge-xs badge-neutral tabular">
                {suggestedRoutines.length}
              </span>
            )}
          </button>
        </div>

        <p className="meta">
          {tab === "log"
            ? "Completed work and where your time went."
            : "Repeating weekly blocks like office days, classes, and practice."}
        </p>
      </div>

      {tab === "log" ? (
        <div className="space-y-5">
          <Card title="Time by area">
            {distribution.map((d) => (
              <div key={d.lifeAreaId} className="orbit-row">
                <div className="orbit-row-main">
                  <div className="flex items-baseline justify-between gap-3">
                    {d.slug ? (
                      <Link
                        href={`/areas/${d.slug}`}
                        className="title hover:underline"
                      >
                        <AreaLabel name={d.name} token={d.colorToken} />
                      </Link>
                    ) : (
                      <p className="title">
                        <AreaLabel name={d.name} token={d.colorToken} />
                      </p>
                    )}
                    <p className="meta tabular">{d.confirmedLabel}</p>
                  </div>
                  <progress
                    className="progress progress-primary mt-2 h-1.5 w-full"
                    value={d.confirmedMinutes}
                    max={maxMinutes}
                    aria-label={`${d.name}: ${d.confirmedLabel}`}
                  />
                  {d.inferredMinutes > 0 && (
                    <p className="meta-soft mt-1">
                      Plus {d.inferredLabel} not confirmed
                    </p>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Card title="History">
            {history.length === 0 ? (
              <p className="meta mt-2">No work logged yet.</p>
            ) : (
              history.map((rec) => (
                <div key={rec.id} className="orbit-row">
                  <div className="orbit-row-main">
                    <p className="title">{rec.title}</p>
                    <p className="meta flex flex-wrap items-center gap-x-3">
                      <span className="tabular">{rec.whenLabel}</span>
                      {rec.durationLabel && <span>{rec.durationLabel}</span>}
                      {rec.lifeArea && (
                        <AreaLabel
                          name={rec.lifeArea.name}
                          token={rec.lifeArea.colorToken}
                        />
                      )}
                      {!rec.isConfirmed && (
                        <span className="font-semibold text-warning">
                          Not confirmed
                        </span>
                      )}
                    </p>
                  </div>
                  {!rec.isConfirmed && (
                    <div className="orbit-row-actions">
                      <form
                        action={async (fd) => {
                          await resolveInferredActivityAction(fd);
                          notify("Work confirmed");
                        }}
                      >
                        <input type="hidden" name="activityId" value={rec.id} />
                        <input type="hidden" name="decision" value="CONFIRM" />
                        <button
                          type="submit"
                          className="btn btn-secondary btn-sm"
                        >
                          Confirm
                        </button>
                      </form>
                      <form
                        action={async (fd) => {
                          await resolveInferredActivityAction(fd);
                          notify("Dismissed");
                        }}
                      >
                        <input type="hidden" name="activityId" value={rec.id} />
                        <input type="hidden" name="decision" value="DISMISS" />
                        <button type="submit" className="btn btn-ghost btn-sm">
                          Dismiss
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ))
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-5">
          {suggestedRoutines.length > 0 && (
            <Card title="Suggested updates">
              {suggestedRoutines.map((r) => (
                <div key={r.id} className="orbit-row">
                  <div className="orbit-row-main">
                    <p className="title">{r.title}</p>
                    <p className="meta flex flex-wrap gap-x-3">
                      <span>{r.daysLabel}</span>
                      <span className="tabular">{r.timeRangeLabel}</span>
                    </p>
                    {r.suggestionReasoning && (
                      <p className="meta mt-1">{r.suggestionReasoning}</p>
                    )}
                  </div>
                  <div className="orbit-row-actions">
                    <form
                      action={async (fd) => {
                        await resolveSuggestedRoutineAction(fd);
                        notify("Routine updated");
                      }}
                    >
                      <input type="hidden" name="routineId" value={r.id} />
                      <input type="hidden" name="decision" value="APPROVE" />
                      <button type="submit" className="btn btn-primary btn-sm">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        <span>Approve</span>
                      </button>
                    </form>
                    <form
                      action={async (fd) => {
                        await resolveSuggestedRoutineAction(fd);
                        notify("Suggestion dismissed");
                      }}
                    >
                      <input type="hidden" name="routineId" value={r.id} />
                      <input type="hidden" name="decision" value="DISMISS" />
                      <button type="submit" className="btn btn-ghost btn-sm">
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <Card title="Weekly routines">
            {declaredRoutines.length === 0 ? (
              <div className="orbit-row">
                <p className="meta orbit-row-main">
                  No repeating weekly blocks set yet.
                </p>
                <CreateRoutineModal
                  lifeAreas={areaOptions}
                  triggerClassName="btn btn-secondary btn-sm"
                />
              </div>
            ) : (
              declaredRoutines.map((r) => (
                <div key={r.id} className="orbit-row">
                  <div className="orbit-row-main">
                    <p className="title">{r.title}</p>
                    <p className="meta flex flex-wrap items-center gap-x-3">
                      {r.lifeArea && (
                        <AreaLabel
                          name={r.lifeArea.name}
                          token={r.lifeArea.colorToken}
                        />
                      )}
                      <span>{r.daysLabel}</span>
                      <span className="tabular">{r.timeRangeLabel}</span>
                    </p>
                    {r.physicalLocation && (
                      <p className="meta-soft">{r.physicalLocation}</p>
                    )}
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
