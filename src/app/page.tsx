import Link from "next/link";
import { Check, MapPin, Play } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getNowOverviewData } from "@/modules/now/now-service";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { ConversationalPlanner } from "@/components/planning/conversational-planner";
import { AreaLabel, Card, Dropdown } from "@/components/ui/page";
import {
  formatClock,
  formatClockRange,
  formatDuration,
  formatLongDate,
  formatShortDate,
} from "@/lib/time/format";
import {
  completeTaskAction,
  logActivityCheckInAction,
  recoverOrRescheduleTaskAction,
  resolveInferredActivityAction,
  startTaskAction,
} from "@/app/actions/orbit-actions";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="h1">Orbit</h1>
        <p className="meta mt-2">
          No user found. Run <code>pnpm db:seed</code> to load the demo data.
        </p>
      </main>
    );
  }

  const data = await getNowOverviewData(user.id);
  const tz = data.ianaTimeZone;
  const loc = data.activeLocationRoutine;

  const pendingActions = data.unreviewedInbox.reduce(
    (sum, entry) => sum + entry.extractedActions.length,
    0
  );

  const focus = [data.activeCommitment, data.nextCommitment].filter(
    (t): t is NonNullable<typeof t> => Boolean(t)
  );
  const flexibleIds = new Set(data.flexibleTasks.map((t) => t.id));
  const extraDeadlines = data.upcomingDeadlines.filter(
    (t) => !flexibleIds.has(t.id)
  );

  return (
    <OrbitShell
      lifeAreas={data.lifeAreas}
      projects={data.projects}
      unreviewedInboxCount={pendingActions}
    >
      <div className="page">
        <header>
          <h1 className="h1">{formatLongDate(data.wallClock.localDate)}</h1>
          {loc && (
            <p className="meta mt-1 inline-flex items-center gap-2">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <span>
                {loc.physicalLocation ?? loc.title} until {loc.endTimeLocal}
              </span>
            </p>
          )}
        </header>

        <ConversationalPlanner />

        {data.needsCheckInTasks.length > 0 && (
          <Card title="Needs a check-in">
            {data.needsCheckInTasks.map((task) => (
              <div key={task.id} className="row">
                <div className="row-main">
                  <p className="title">{task.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <AreaLabel
                      name={task.lifeArea.name}
                      token={task.lifeArea.colorToken}
                    />
                    {task.scheduledStart && task.scheduledEnd && (
                      <span className="tabular">
                        {formatClockRange(
                          task.scheduledStart,
                          task.scheduledEnd,
                          tz
                        )}
                      </span>
                    )}
                  </p>
                </div>
                <div className="row-actions">
                  <form action={completeTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button type="submit" className="button button-primary">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span>Completed</span>
                    </button>
                  </form>
                  <form action={recoverOrRescheduleTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <input
                      type="hidden"
                      name="recoveryKind"
                      value="STILL_WORKING_30M"
                    />
                    <button type="submit" className="button button-secondary">
                      +30 min
                    </button>
                  </form>
                  <Dropdown label="Move">
                    <form action={recoverOrRescheduleTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <input
                        type="hidden"
                        name="recoveryKind"
                        value="TOMORROW_AFTERNOON"
                      />
                      <button type="submit" className="menu-item">
                        Tomorrow afternoon
                      </button>
                    </form>
                    <form action={recoverOrRescheduleTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <input
                        type="hidden"
                        name="recoveryKind"
                        value="MAKE_FLEXIBLE"
                      />
                      <button type="submit" className="menu-item">
                        Make flexible
                      </button>
                    </form>
                  </Dropdown>
                </div>
              </div>
            ))}
          </Card>
        )}

        <Card title={data.activeCommitment ? "Now and next" : "Up next"}>
          {focus.length === 0 ? (
            <p className="meta mt-2">Nothing else is scheduled today.</p>
          ) : (
            focus.map((task) => {
              const isActive = task.id === data.activeCommitment?.id;
              return (
                <div key={task.id} className="row">
                  <div className="row-main">
                    <p className="meta tabular">
                      {task.scheduledStart && task.scheduledEnd
                        ? formatClockRange(
                            task.scheduledStart,
                            task.scheduledEnd,
                            tz
                          )
                        : ""}
                      {isActive ? " (now)" : ""}
                    </p>
                    <p className="title">{task.title}</p>
                    <p className="meta">
                      <AreaLabel
                        name={task.lifeArea.name}
                        token={task.lifeArea.colorToken}
                      />
                    </p>
                  </div>
                  <div className="row-actions">
                    {task.status !== "IN_PROGRESS" && (
                      <form action={startTaskAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <button type="submit" className="button button-secondary">
                          <Play className="h-4 w-4" aria-hidden="true" />
                          <span>Start</span>
                        </button>
                      </form>
                    )}
                    <form action={completeTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <button type="submit" className="button button-primary">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        <span>Done</span>
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </Card>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card
            title="Flexible"
            action={
              <Link href="/areas" className="button button-ghost">
                All tasks
              </Link>
            }
          >
            {data.flexibleTasks.length === 0 && (
              <p className="meta mt-2">No flexible tasks.</p>
            )}
            {data.flexibleTasks.map((task) => (
              <div key={task.id} className="row">
                <div className="row-main">
                  <p className="title">{task.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <AreaLabel
                      name={task.lifeArea.name}
                      token={task.lifeArea.colorToken}
                    />
                    {task.estimatedMinutes && (
                      <span>{formatDuration(task.estimatedMinutes)}</span>
                    )}
                    {task.dueDate && (
                      <span>Due {formatShortDate(task.dueDate, tz)}</span>
                    )}
                  </p>
                </div>
                <div className="row-actions">
                  <form action={startTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      type="submit"
                      aria-label={`Start ${task.title}`}
                      className="button button-ghost button-icon"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                  <form action={completeTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      type="submit"
                      aria-label={`Mark ${task.title} done`}
                      className="button button-secondary button-icon"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </Card>

          <Card title={extraDeadlines.length > 0 ? "Waiting and due" : "Waiting"}>
            {extraDeadlines.length === 0 &&
              data.waitingTasks.length === 0 && (
                <p className="meta mt-2">Nothing waiting.</p>
              )}
            {extraDeadlines.map((task) => (
              <div key={task.id} className="row">
                <div className="row-main">
                  <p className="title">{task.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <AreaLabel
                      name={task.lifeArea.name}
                      token={task.lifeArea.colorToken}
                    />
                    {task.dueDate && (
                      <span>Due {formatShortDate(task.dueDate, tz)}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
            {data.waitingTasks.map((task) => (
              <div key={task.id} className="row">
                <div className="row-main">
                  <p className="title">{task.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <AreaLabel
                      name={task.lifeArea.name}
                      token={task.lifeArea.colorToken}
                    />
                    <span>Waiting on {task.waitingOnPerson ?? "someone"}</span>
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {pendingActions > 0 && data.unreviewedInbox[0] && (
          <Card title="Inbox">
            <div className="row">
              <div className="row-main">
                <p className="title">
                  {data.unreviewedInbox[0].title ?? "Captured note"}
                </p>
                <p className="meta">
                  {pendingActions} {pendingActions === 1 ? "action" : "actions"}{" "}
                  to review
                </p>
              </div>
              <Link href="/inbox" className="button button-secondary">
                Review
              </Link>
            </div>
          </Card>
        )}

        <Card title="Activity today">
          <form
            action={logActivityCheckInAction}
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_11rem_auto]"
          >
            <label htmlFor="checkin-title" className="visually-hidden">
              What are you working on
            </label>
            <input
              id="checkin-title"
              name="title"
              type="text"
              required
              autoComplete="off"
              placeholder="What are you working on?"
              className="field"
            />
            <label htmlFor="checkin-area" className="visually-hidden">
              Area
            </label>
            <select
              id="checkin-area"
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
            <button type="submit" className="button button-primary">
              Log
            </button>
          </form>

          <div className="mt-2">
            {data.todayActivities.length === 0 && (
              <p className="meta py-3">Nothing logged yet.</p>
            )}
            {data.todayActivities.map((act) => (
              <div key={act.id} className="row">
                <div className="row-main">
                  <p className="title">{act.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <span className="tabular">
                      {formatClock(act.startedAt, tz)}
                    </span>
                    {act.lifeArea && (
                      <AreaLabel
                        name={act.lifeArea.name}
                        token={act.lifeArea.colorToken}
                      />
                    )}
                    {!act.isConfirmed && (
                      <span className="font-semibold text-[#b45309]">
                        Not confirmed
                      </span>
                    )}
                  </p>
                </div>
                {!act.isConfirmed && (
                  <div className="row-actions">
                    <form action={resolveInferredActivityAction}>
                      <input type="hidden" name="activityId" value={act.id} />
                      <input type="hidden" name="decision" value="CONFIRM" />
                      <button type="submit" className="button button-secondary">
                        Confirm
                      </button>
                    </form>
                    <form action={resolveInferredActivityAction}>
                      <input type="hidden" name="activityId" value={act.id} />
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
