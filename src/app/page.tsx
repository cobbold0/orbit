import Link from "next/link";
import { Check, MapPin, Play } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getNowOverviewData } from "@/modules/now/now-service";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { ConversationalPlanner } from "@/components/planning/conversational-planner";
import { AreaLabel, Card, PageHeader } from "@/components/ui/page";
import { RescheduleTaskModal } from "@/components/modals/reschedule-task-modal";
import { LogActivityModal } from "@/components/modals/activity-modals";
import {
  formatClock,
  formatClockRange,
  formatDuration,
  formatLongDate,
  formatShortDate,
} from "@/lib/time/format";
import {
  completeTaskAction,
  recoverOrRescheduleTaskAction,
  resolveInferredActivityAction,
  respondToNotificationAction,
  startTaskAction,
} from "@/app/actions/orbit-actions";
import { evaluateDueBackgroundJobs } from "@/modules/notifications/notification-service";

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

  await evaluateDueBackgroundJobs({ userId: user.id, limit: 10 });
  const data = await getNowOverviewData(user.id);
  const tz = data.ianaTimeZone;
  const loc = data.activeLocationRoutine;
  const areaOptions = data.lifeAreas.map((a) => ({ id: a.id, name: a.name }));

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
      unreadCheckInCount={data.activeCheckIns.length}
    >
      <div className="page">
        <PageHeader
          title={formatLongDate(data.wallClock.localDate)}
          subtitle={
            loc ? (
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                <span>
                  {loc.physicalLocation ?? loc.title} until {loc.endTimeLocal}
                </span>
              </span>
            ) : undefined
          }
        />

        <ConversationalPlanner />

        {data.activeCheckIns.length > 0 && (
          <Card title="Check-ins">
            {data.activeCheckIns.map((chk) => (
              <div key={chk.id} className="orbit-row">
                <div className="orbit-row-main">
                  <p className="title">{chk.title}</p>
                  <p className="meta">{chk.body}</p>
                </div>
                <div className="orbit-row-actions">
                  <Link
                    href={chk.actionUrl}
                    className="btn btn-primary btn-sm"
                  >
                    Respond
                  </Link>
                  <form action={respondToNotificationAction}>
                    <input type="hidden" name="notificationId" value={chk.id} />
                    <input type="hidden" name="responseValue" value="DISMISS" />
                    <button
                      type="submit"
                      aria-label={`Dismiss ${chk.title}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Dismiss
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </Card>
        )}

        {data.needsCheckInTasks.length > 0 && (
          <Card title="Needs a check-in">
            {data.needsCheckInTasks.map((task) => (
              <div key={task.id} className="orbit-row">
                <div className="orbit-row-main">
                  <p className="title">{task.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <Link
                      href={`/areas/${task.lifeArea.slug}`}
                      className="hover:underline"
                    >
                      <AreaLabel
                        name={task.lifeArea.name}
                        token={task.lifeArea.colorToken}
                      />
                    </Link>
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
                <div className="orbit-row-actions">
                  <form action={completeTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button type="submit" className="btn btn-primary btn-sm">
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
                    <button type="submit" className="btn btn-secondary btn-sm">
                      +30 min
                    </button>
                  </form>
                  <RescheduleTaskModal
                    taskId={task.id}
                    taskTitle={task.title}
                    commitmentType="SCHEDULED"
                    triggerClassName="btn btn-ghost btn-sm"
                  />
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
                <div key={task.id} className="orbit-row">
                  <div className="orbit-row-main">
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
                      <Link
                        href={`/areas/${task.lifeArea.slug}`}
                        className="hover:underline"
                      >
                        <AreaLabel
                          name={task.lifeArea.name}
                          token={task.lifeArea.colorToken}
                        />
                      </Link>
                    </p>
                  </div>
                  <div className="orbit-row-actions">
                    <RescheduleTaskModal
                      taskId={task.id}
                      taskTitle={task.title}
                      commitmentType="SCHEDULED"
                    />
                    {task.status !== "IN_PROGRESS" && (
                      <form action={startTaskAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <button
                          type="submit"
                          aria-label={`Start ${task.title}`}
                          className="btn btn-secondary btn-sm"
                        >
                          <Play className="h-4 w-4" aria-hidden="true" />
                          <span>Start</span>
                        </button>
                      </form>
                    )}
                    <form action={completeTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <button
                        type="submit"
                        aria-label={`Done ${task.title}`}
                        className="btn btn-primary btn-sm"
                      >
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
              <Link href="/areas/tasks" className="btn btn-ghost btn-sm">
                All tasks
              </Link>
            }
          >
            {data.flexibleTasks.length === 0 && (
              <p className="meta mt-2">No flexible tasks.</p>
            )}
            {data.flexibleTasks.map((task) => (
              <div key={task.id} className="orbit-row">
                <div className="orbit-row-main">
                  <p className="title">{task.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <Link
                      href={`/areas/${task.lifeArea.slug}`}
                      className="hover:underline"
                    >
                      <AreaLabel
                        name={task.lifeArea.name}
                        token={task.lifeArea.colorToken}
                      />
                    </Link>
                    {task.estimatedMinutes && (
                      <span>{formatDuration(task.estimatedMinutes)}</span>
                    )}
                    {task.dueDate && (
                      <span>Due {formatShortDate(task.dueDate, tz)}</span>
                    )}
                  </p>
                </div>
                <div className="orbit-row-actions">
                  <RescheduleTaskModal
                    taskId={task.id}
                    taskTitle={task.title}
                    commitmentType="FLEXIBLE"
                    defaultDateStr={data.wallClock.localDate}
                  />
                  <form action={startTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      type="submit"
                      aria-label={`Start ${task.title}`}
                      className="btn btn-ghost btn-sm btn-square"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                  <form action={completeTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      type="submit"
                      aria-label={`Mark ${task.title} done`}
                      className="btn btn-secondary btn-sm btn-square"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </Card>

          <Card
            title={extraDeadlines.length > 0 ? "Waiting and due" : "Waiting"}
          >
            {extraDeadlines.length === 0 && data.waitingTasks.length === 0 && (
              <p className="meta mt-2">Nothing waiting.</p>
            )}
            {extraDeadlines.map((task) => (
              <div key={task.id} className="orbit-row">
                <div className="orbit-row-main">
                  <p className="title">{task.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <Link
                      href={`/areas/${task.lifeArea.slug}`}
                      className="hover:underline"
                    >
                      <AreaLabel
                        name={task.lifeArea.name}
                        token={task.lifeArea.colorToken}
                      />
                    </Link>
                    {task.dueDate && (
                      <span>Due {formatShortDate(task.dueDate, tz)}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
            {data.waitingTasks.map((task) => (
              <div key={task.id} className="orbit-row">
                <div className="orbit-row-main">
                  <p className="title">{task.title}</p>
                  <p className="meta flex flex-wrap items-center gap-x-3">
                    <Link
                      href={`/areas/${task.lifeArea.slug}`}
                      className="hover:underline"
                    >
                      <AreaLabel
                        name={task.lifeArea.name}
                        token={task.lifeArea.colorToken}
                      />
                    </Link>
                    <span>Waiting on {task.waitingOnPerson ?? "someone"}</span>
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </div>

        {pendingActions > 0 && data.unreviewedInbox[0] && (
          <Card title="From your notes">
            <div className="orbit-row">
              <div className="orbit-row-main">
                <p className="title">
                  {data.unreviewedInbox[0].title ?? "Captured note"}
                </p>
                <p className="meta">
                  {pendingActions}{" "}
                  {pendingActions === 1 ? "task" : "tasks"} spotted in your
                  notes
                </p>
              </div>
              <Link href="/inbox" className="btn btn-secondary btn-sm">
                Review
              </Link>
            </div>
          </Card>
        )}

        <Card
          title="Activity today"
          action={
            <LogActivityModal
              lifeAreas={areaOptions}
              triggerClassName="btn btn-secondary btn-sm"
            />
          }
        >
          {data.todayActivities.length === 0 ? (
            <p className="meta mt-2">Nothing logged yet today.</p>
          ) : (
            data.todayActivities.map((act) => (
              <div key={act.id} className="orbit-row">
                <div className="orbit-row-main">
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
                      <span className="font-semibold text-warning">
                        Not confirmed
                      </span>
                    )}
                  </p>
                </div>
                {!act.isConfirmed && (
                  <div className="orbit-row-actions">
                    <form action={resolveInferredActivityAction}>
                      <input type="hidden" name="activityId" value={act.id} />
                      <input type="hidden" name="decision" value="CONFIRM" />
                      <button type="submit" className="btn btn-secondary btn-sm">
                        Confirm
                      </button>
                    </form>
                    <form action={resolveInferredActivityAction}>
                      <input type="hidden" name="activityId" value={act.id} />
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
    </OrbitShell>
  );
}
