import Link from "next/link";
import {
  ArrowRight,
  Check,
  MapPin,
  Play,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getNowOverviewData } from "@/modules/now/now-service";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { ConversationalPlanner } from "@/components/planning/conversational-planner";
import { DailyDigestSpeaker } from "@/components/planning/daily-digest-speaker";
import { AreaLabel, Card } from "@/components/ui/page";
import { RescheduleTaskModal } from "@/components/modals/reschedule-task-modal";
import { EditTaskModal } from "@/components/modals/edit-task-modal";
import { DeleteTaskButton } from "@/components/modals/delete-task-button";
import { LogActivityModal } from "@/components/modals/activity-modals";
import { ActionSubmitButton } from "@/components/ui/action-button";
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
          No user found. Please <Link href="/sign-in" className="text-primary underline">sign in</Link> to continue.
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

  const checkInCount = data.activeCheckIns.length;
  const needsCheckInCount = data.needsCheckInTasks.length;
  const scheduledCount = data.scheduledToday.length;
  const flexibleCount = data.flexibleTasks.length;

  // Local wall-clock greeting calculation
  const hour = parseInt(data.wallClock.localTimeHHmm.split(":")[0] ?? "12", 10);
  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";

  const firstName = user.name?.split(" ")[0] || "there";

  // Build conversational day narrative
  let narrative = "";
  if (data.activeCommitment) {
    narrative = `You are currently in focus on "${data.activeCommitment.title}".`;
    if (data.nextCommitment) {
      const timeStr = data.nextCommitment.scheduledStart
        ? formatClock(data.nextCommitment.scheduledStart, tz)
        : "";
      narrative += ` Next up is "${data.nextCommitment.title}"${
        timeStr ? ` at ${timeStr}` : ""
      }.`;
    }
  } else if (checkInCount > 0 || needsCheckInCount > 0) {
    const attentionParts: string[] = [];
    if (checkInCount > 0) {
      attentionParts.push(
        `${checkInCount} check-in waiting for your response`
      );
    }
    if (needsCheckInCount > 0) {
      attentionParts.push(
        `${needsCheckInCount} completed ${
          needsCheckInCount === 1 ? "window" : "windows"
        } to confirm`
      );
    }
    const attentionStr = attentionParts.join(" and ");

    if (data.nextCommitment) {
      const timeStr = data.nextCommitment.scheduledStart
        ? formatClock(data.nextCommitment.scheduledStart, tz)
        : "";
      narrative = `We have ${attentionStr}. Today we have "${data.nextCommitment.title}"${
        timeStr ? ` coming up at ${timeStr}` : ""
      }.`;
    } else {
      narrative = `We have ${attentionStr}. The rest of your schedule is open for flexible focus.`;
    }
  } else if (data.nextCommitment) {
    const timeStr = data.nextCommitment.scheduledStart
      ? formatClock(data.nextCommitment.scheduledStart, tz)
      : "";
    narrative = `Today we have "${data.nextCommitment.title}"${
      timeStr ? ` coming up at ${timeStr}` : ""
    }, with ${scheduledCount} scheduled ${
      scheduledCount === 1 ? "commitment" : "commitments"
    } on deck.`;
  } else if (flexibleCount > 0) {
    narrative = `Your schedule is open today, with ${flexibleCount} flexible ${
      flexibleCount === 1 ? "task" : "tasks"
    } ready when you want to dive in.`;
  } else {
    narrative =
      "Your schedule and commitments are all caught up for today. Enjoy the clear space.";
  }

  const flexibleIds = new Set(data.flexibleTasks.map((t) => t.id));
  const extraDeadlines = data.upcomingDeadlines.filter(
    (t) => !flexibleIds.has(t.id)
  );

  return (
    <OrbitShell
      lifeAreas={data.lifeAreas}
      projects={data.projects}
      unreviewedInboxCount={pendingActions}
      unreadCheckInCount={checkInCount}
      user={{
        name: user.name,
        email: user.email,
      }}
    >
      <div className="page space-y-6">
        {/* Conversational Morning / Day Briefing Hero */}
        <section
          aria-label="Today briefing"
          className="card bg-base-100 border border-base-300/70 p-6 sm:p-7 shadow-xs"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-wider uppercase text-base-content/50">
                  {formatLongDate(data.wallClock.localDate)}
                </span>
                {loc && (
                  <span className="badge badge-soft badge-neutral text-xs gap-1.5 py-1 px-2.5">
                    <MapPin className="h-3.5 w-3.5 text-base-content/70" />
                    <span>
                      {loc.physicalLocation ?? loc.title} until {loc.endTimeLocal}
                    </span>
                  </span>
                )}
              </div>

              <DailyDigestSpeaker
                firstName={firstName}
                greeting={greeting}
                dateStr={formatLongDate(data.wallClock.localDate)}
                activeCommitment={data.activeCommitment?.title}
                scheduledTasks={data.scheduledToday.map((t) => ({
                  title: t.title,
                  area: t.lifeArea.name,
                  time: t.scheduledStart ? formatClock(t.scheduledStart, tz) : undefined,
                }))}
                flexibleTasks={data.flexibleTasks.map((t) => ({
                  title: t.title,
                  area: t.lifeArea.name,
                }))}
                checkInCount={checkInCount}
                location={
                  loc
                    ? `${loc.physicalLocation ?? loc.title} until ${loc.endTimeLocal}`
                    : undefined
                }
              />
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-base-content">
                {greeting}, {firstName}.
              </h1>
              <p className="mt-2 text-base sm:text-lg text-base-content/85 leading-relaxed font-normal max-w-3xl">
                How are you doing today? {narrative}
              </p>
            </div>

            {/* Embedded Conversational Planner Action Bar */}
            <div className="pt-2">
              <ConversationalPlanner
                embedded
                placeholder="Ask Orbit to plan, move or update a commitment..."
              />
            </div>

            {/* Today's Pulse Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-base-200/90 text-xs text-base-content/60">
              <span className="font-medium text-base-content">Today:</span>
              {data.activeCommitment ? (
                <span className="badge badge-sm badge-primary gap-1.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-content animate-pulse" />
                  <span>In focus: {data.activeCommitment.title}</span>
                </span>
              ) : (
                <span className="badge badge-sm badge-neutral">No active focus timer</span>
              )}
              {scheduledCount > 0 && (
                <span className="badge badge-sm badge-ghost">
                  {scheduledCount} {scheduledCount === 1 ? "commitment" : "commitments"} scheduled
                </span>
              )}
              {checkInCount > 0 && (
                <span className="badge badge-sm badge-secondary">
                  {checkInCount} check-in waiting
                </span>
              )}
              {flexibleCount > 0 && (
                <span className="badge badge-sm badge-ghost">
                  {flexibleCount} flexible
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Needs Your Attention: Check-ins & Elapsed Commitments */}
        {(checkInCount > 0 || needsCheckInCount > 0) && (
          <Card title="Needs your attention">
            {data.activeCheckIns.map((chk) => (
              <div key={chk.id} className="orbit-row">
                <div className="orbit-row-main">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-xs badge-secondary" />
                    <p className="title font-semibold text-base-content">
                      {chk.title}
                    </p>
                  </div>
                  <p className="meta mt-0.5">{chk.body}</p>
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
                    <span className="text-warning font-medium">Scheduled window ended</span>
                  </p>
                </div>
                <div className="orbit-row-actions">
                  <form action={completeTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <ActionSubmitButton
                      className="btn btn-primary btn-sm"
                      icon={<Check className="h-4 w-4" aria-hidden="true" />}
                    >
                      Completed
                    </ActionSubmitButton>
                  </form>
                  <form action={recoverOrRescheduleTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <input
                      type="hidden"
                      name="recoveryKind"
                      value="STILL_WORKING_30M"
                    />
                    <ActionSubmitButton className="btn btn-secondary btn-sm">
                      +30 min
                    </ActionSubmitButton>
                  </form>
                  <RescheduleTaskModal
                    taskId={task.id}
                    taskTitle={task.title}
                    commitmentType="SCHEDULED"
                    triggerClassName="btn btn-ghost btn-sm"
                  />
                  <EditTaskModal
                    task={{
                      id: task.id,
                      title: task.title,
                      lifeAreaId: task.lifeAreaId,
                      estimatedMinutes: task.estimatedMinutes,
                    }}
                    lifeAreas={data.lifeAreas}
                  />
                  <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Today's Schedule & Commitments */}
        <Card
          title="Today's schedule"
          action={
            <Link href="/timeline" className="btn btn-ghost btn-sm gap-1">
              <span>Timeline</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {data.scheduledToday.length === 0 ? (
            <div className="py-2 text-center sm:text-left">
              <p className="meta">No commitments scheduled on your calendar today.</p>
              <p className="meta text-xs mt-1">Pick a flexible task below to work on when you are ready.</p>
            </div>
          ) : (
            data.scheduledToday.map((task) => {
              const isCurrentFocus = task.id === data.activeCommitment?.id;
              const isDone = task.status === "COMPLETED";
              return (
                <div key={task.id} className="orbit-row">
                  <div className="orbit-row-main">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="meta tabular font-medium text-xs">
                        {task.scheduledStart && task.scheduledEnd
                          ? formatClockRange(
                              task.scheduledStart,
                              task.scheduledEnd,
                              tz
                            )
                          : ""}
                      </p>
                      {isCurrentFocus && (
                        <span className="badge badge-primary badge-xs font-semibold uppercase tracking-wider">
                          Now in focus
                        </span>
                      )}
                      {task.status === "IN_PROGRESS" && !isCurrentFocus && (
                        <span className="badge badge-info badge-xs">
                          In progress
                        </span>
                      )}
                    </div>
                    <p className={`title ${isDone ? "line-through opacity-60" : ""}`}>
                      {task.title}
                    </p>
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
                        <ActionSubmitButton
                          className="btn btn-secondary btn-sm"
                          ariaLabel={`Start ${task.title}`}
                          icon={<Play className="h-4 w-4" aria-hidden="true" />}
                        >
                          Start
                        </ActionSubmitButton>
                      </form>
                    )}
                    <EditTaskModal
                      task={{
                        id: task.id,
                        title: task.title,
                        lifeAreaId: task.lifeAreaId,
                        estimatedMinutes: task.estimatedMinutes,
                      }}
                      lifeAreas={data.lifeAreas}
                    />
                    <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
                    <form action={completeTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <ActionSubmitButton
                        className="btn btn-primary btn-sm"
                        ariaLabel={`Done ${task.title}`}
                        icon={<Check className="h-4 w-4" aria-hidden="true" />}
                      >
                        Done
                      </ActionSubmitButton>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </Card>

        {/* Lower Two-Column Grid: Flexible Tasks & Notes / Blockers */}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {/* Flexible queue */}
          <Card
            title="Flexible"
            action={
              <Link href="/areas/tasks" className="btn btn-ghost btn-sm">
                All tasks
              </Link>
            }
          >
            {data.flexibleTasks.length === 0 && (
              <p className="meta mt-2">No flexible tasks waiting.</p>
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
                  <EditTaskModal
                    task={{
                      id: task.id,
                      title: task.title,
                      lifeAreaId: task.lifeAreaId,
                      estimatedMinutes: task.estimatedMinutes,
                    }}
                    lifeAreas={data.lifeAreas}
                  />
                  <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
                  <RescheduleTaskModal
                    taskId={task.id}
                    taskTitle={task.title}
                    commitmentType="FLEXIBLE"
                    defaultDateStr={data.wallClock.localDate}
                  />
                  <form action={startTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <ActionSubmitButton
                      className="btn btn-ghost btn-sm btn-square"
                      ariaLabel={`Start ${task.title}`}
                      icon={<Play className="h-4 w-4" aria-hidden="true" />}
                    />
                  </form>
                  <form action={completeTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <ActionSubmitButton
                      className="btn btn-secondary btn-sm btn-square"
                      ariaLabel={`Mark ${task.title} done`}
                      icon={<Check className="h-4 w-4" aria-hidden="true" />}
                    />
                  </form>
                </div>
              </div>
            ))}
          </Card>

          {/* Right column: Notes and Waiting on others */}
          <div className="space-y-5">
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
              title={extraDeadlines.length > 0 ? "Waiting and due" : "Waiting"}
            >
              {extraDeadlines.length === 0 && data.waitingTasks.length === 0 && (
                <p className="meta mt-2">Nothing waiting on others.</p>
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
                  <div className="orbit-row-actions">
                    <EditTaskModal
                      task={{
                        id: task.id,
                        title: task.title,
                        lifeAreaId: task.lifeAreaId,
                        estimatedMinutes: task.estimatedMinutes,
                      }}
                      lifeAreas={data.lifeAreas}
                    />
                    <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
                    <form action={completeTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <ActionSubmitButton
                        className="btn btn-ghost btn-sm btn-square"
                        ariaLabel={`Done ${task.title}`}
                        icon={<Check className="h-4 w-4" aria-hidden="true" />}
                      />
                    </form>
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
                  <div className="orbit-row-actions">
                    <EditTaskModal
                      task={{
                        id: task.id,
                        title: task.title,
                        lifeAreaId: task.lifeAreaId,
                        estimatedMinutes: task.estimatedMinutes,
                      }}
                      lifeAreas={data.lifeAreas}
                    />
                    <DeleteTaskButton taskId={task.id} taskTitle={task.title} />
                    <form action={completeTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <ActionSubmitButton
                        className="btn btn-ghost btn-sm btn-square"
                        ariaLabel={`Done ${task.title}`}
                        icon={<Check className="h-4 w-4" aria-hidden="true" />}
                      />
                    </form>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>

        {/* Activity Logged Today */}
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
