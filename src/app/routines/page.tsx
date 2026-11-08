import { Check } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getActivityAndRoutinesData } from "@/modules/activity/activity-service";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { AreaLabel, Card, PageHeader } from "@/components/ui/page";
import {
  formatClock,
  formatDays,
  formatDuration,
  formatShortDate,
} from "@/lib/time/format";
import {
  logActivityCheckInAction,
  resolveInferredActivityAction,
  resolveSuggestedRoutineAction,
} from "@/app/actions/orbit-actions";
import { prisma } from "@/lib/db/prisma";
import { getUnreviewedInboxActionCount } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [data, projects, unreviewedInboxCount] = await Promise.all([
    getActivityAndRoutinesData(user.id),
    prisma.project.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true, title: true, lifeAreaId: true },
    }),
    getUnreviewedInboxActionCount(user.id),
  ]);
  const tz = data.ianaTimeZone;

  const maxMinutes = Math.max(
    1,
    ...data.areaDistribution.map((d) => d.confirmedMinutes)
  );

  return (
    <OrbitShell
      lifeAreas={data.lifeAreas}
      projects={projects}
      unreviewedInboxCount={unreviewedInboxCount}
    >
      <div className="page">
        <PageHeader title="Activity" />

        {data.suggestedRoutines.length > 0 && (
          <Card title="Suggested changes">
            {data.suggestedRoutines.map((r) => (
              <div key={r.id} className="row">
                <div className="row-main">
                  <p className="title">{r.title}</p>
                  <p className="meta flex flex-wrap gap-x-3">
                    <span>{formatDays(r.daysOfWeek)}</span>
                    <span className="tabular">
                      {r.startTimeLocal} to {r.endTimeLocal}
                    </span>
                  </p>
                  {r.suggestionReasoning && (
                    <p className="meta mt-1">{r.suggestionReasoning}</p>
                  )}
                </div>
                <div className="row-actions">
                  <form action={resolveSuggestedRoutineAction}>
                    <input type="hidden" name="routineId" value={r.id} />
                    <input type="hidden" name="decision" value="APPROVE" />
                    <button type="submit" className="button button-primary">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span>Approve</span>
                    </button>
                  </form>
                  <form action={resolveSuggestedRoutineAction}>
                    <input type="hidden" name="routineId" value={r.id} />
                    <input type="hidden" name="decision" value="DISMISS" />
                    <button type="submit" className="button button-ghost">
                      Dismiss
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </Card>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card title="Time by area">
            {data.areaDistribution.map((d) => (
              <div key={d.lifeAreaId} className="row">
                <div className="row-main">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="title">
                      <AreaLabel name={d.name} token={d.colorToken} />
                    </p>
                    <p className="meta tabular">
                      {formatDuration(d.confirmedMinutes)}
                    </p>
                  </div>
                  <progress
                    className="bar mt-2"
                    value={d.confirmedMinutes}
                    max={maxMinutes}
                    aria-label={`${d.name}: ${formatDuration(d.confirmedMinutes)}`}
                  />
                  {d.inferredMinutes > 0 && (
                    <p className="meta-soft mt-1">
                      Plus {formatDuration(d.inferredMinutes)} not confirmed
                    </p>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <Card title="Routines">
            {data.declaredRoutines.length === 0 && (
              <p className="meta mt-2">No routines.</p>
            )}
            {data.declaredRoutines.map((r) => (
              <div key={r.id} className="row">
                <div className="row-main">
                  <p className="title">{r.title}</p>
                  <p className="meta flex flex-wrap gap-x-3">
                    <span>{formatDays(r.daysOfWeek)}</span>
                    <span className="tabular">
                      {r.startTimeLocal} to {r.endTimeLocal}
                    </span>
                  </p>
                  {r.physicalLocation && (
                    <p className="meta-soft">{r.physicalLocation}</p>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </div>

        <Card title="History">
          <form
            action={logActivityCheckInAction}
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_6rem_auto]"
          >
            <label htmlFor="h-title" className="visually-hidden">
              Activity
            </label>
            <input
              id="h-title"
              name="title"
              required
              autoComplete="off"
              placeholder="What did you do?"
              className="field"
            />
            <label htmlFor="h-area" className="visually-hidden">
              Area
            </label>
            <select
              id="h-area"
              name="lifeAreaId"
              defaultValue={data.lifeAreas[0]?.id ?? ""}
              className="field"
            >
              {data.lifeAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <label htmlFor="h-min" className="visually-hidden">
              Minutes
            </label>
            <input
              id="h-min"
              name="durationMinutes"
              inputMode="numeric"
              defaultValue="45"
              aria-label="Minutes"
              className="field"
            />
            <button type="submit" className="button button-primary">
              Add
            </button>
          </form>

          <div className="mt-2">
            {data.activityRecords.map((rec) => (
              <div key={rec.id} className="row">
                <div className="row-main">
                  <p className="title">{rec.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <span className="tabular">
                      {formatShortDate(rec.startedAt, tz)},{" "}
                      {formatClock(rec.startedAt, tz)}
                    </span>
                    {rec.durationMinutes && (
                      <span>{formatDuration(rec.durationMinutes)}</span>
                    )}
                    {rec.lifeArea && (
                      <AreaLabel
                        name={rec.lifeArea.name}
                        token={rec.lifeArea.colorToken}
                      />
                    )}
                    {!rec.isConfirmed && (
                      <span className="font-semibold text-[#b45309]">
                        Not confirmed
                      </span>
                    )}
                  </p>
                </div>
                {!rec.isConfirmed && (
                  <div className="row-actions">
                    <form action={resolveInferredActivityAction}>
                      <input type="hidden" name="activityId" value={rec.id} />
                      <input type="hidden" name="decision" value="CONFIRM" />
                      <button type="submit" className="button button-secondary">
                        Confirm
                      </button>
                    </form>
                    <form action={resolveInferredActivityAction}>
                      <input type="hidden" name="activityId" value={rec.id} />
                      <input type="hidden" name="decision" value="DISMISS" />
                      <button type="submit" className="button button-ghost">
                        Dismiss
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </OrbitShell>
  );
}
