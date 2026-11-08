import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getUnifiedTimelineData,
  type TimelineDayModel,
} from "@/modules/timeline/timeline-service";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { AreaDot, AreaLabel, Card, Dropdown } from "@/components/ui/page";
import { formatDuration, formatLongDate } from "@/lib/time/format";
import {
  completeTaskAction,
  recoverOrRescheduleTaskAction,
} from "@/app/actions/orbit-actions";
import { prisma } from "@/lib/db/prisma";
import { getUnreviewedInboxActionCount } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

interface TimelinePageProps {
  searchParams: Promise<{ date?: string; view?: "day" | "week" }>;
}

type FlexTask = {
  id: string;
  title: string;
  lifeArea: { name: string };
};

type DayItem =
  | { kind: "task"; start: Date; task: TimelineDayModel["scheduledCommitments"][number] }
  | { kind: "free"; start: Date; win: TimelineDayModel["availableWindows"][number] };

function buildDayItems(day: TimelineDayModel): DayItem[] {
  const items: DayItem[] = [
    ...day.scheduledCommitments.map(
      (task): DayItem => ({ kind: "task", start: task.scheduledStart, task })
    ),
    ...day.availableWindows.map(
      (win): DayItem => ({ kind: "free", start: win.startUtc, win })
    ),
  ];
  return items.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function SlotMenu({
  startIso,
  tasks,
}: {
  startIso: string;
  tasks: FlexTask[];
}) {
  if (tasks.length === 0) return null;
  return (
    <Dropdown label="Schedule" variant="secondary">
      {tasks.map((t) => (
        <form key={t.id} action={recoverOrRescheduleTaskAction}>
          <input type="hidden" name="taskId" value={t.id} />
          <input type="hidden" name="recoveryKind" value="SLOT_INTO_WINDOW" />
          <input type="hidden" name="windowStartIso" value={startIso} />
          <button type="submit" className="menu-item">
            <span className="min-w-0">
              <span className="block truncate">{t.title}</span>
              <span className="meta-soft block">{t.lifeArea.name}</span>
            </span>
          </button>
        </form>
      ))}
    </Dropdown>
  );
}

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const view = params.view === "week" ? "week" : "day";
  const [timeline, projects, unreviewedInboxCount] = await Promise.all([
    getUnifiedTimelineData(user.id, params.date),
    prisma.project.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true, title: true, lifeAreaId: true },
    }),
    getUnreviewedInboxActionCount(user.id),
  ]);

  const focal = timeline.focalDay;
  const items = buildDayItems(focal);
  const flex = timeline.flexibleTasks;

  const nav = (date: string, v = view) => `/timeline?date=${date}&view=${v}`;

  return (
    <OrbitShell
      lifeAreas={timeline.lifeAreas}
      projects={projects}
      unreviewedInboxCount={unreviewedInboxCount}
    >
      <div className="page">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="h1">
            {view === "day" ? formatLongDate(focal.dateStr) : "This week"}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Link
                href={nav(timeline.previousWeekDateStr)}
                aria-label="Previous week"
                className="button button-ghost button-icon"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link href={nav(timeline.todayDateStr)} className="button button-ghost">
                Today
              </Link>
              <Link
                href={nav(timeline.nextWeekDateStr)}
                aria-label="Next week"
                className="button button-ghost button-icon"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
            <div className="segmented" role="group" aria-label="View">
              <Link
                href={nav(focal.dateStr, "day")}
                className="segmented-item"
                aria-pressed={view === "day"}
              >
                Day
              </Link>
              <Link
                href={nav(focal.dateStr, "week")}
                className="segmented-item"
                aria-pressed={view === "week"}
              >
                Week
              </Link>
            </div>
          </div>
        </header>

        {/* Week strip */}
        <nav aria-label="Days" className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {timeline.days.map((d) => {
            const selected = d.dateStr === focal.dateStr;
            const place = d.locationContexts[0]?.physicalLocation?.replace(
              " Office",
              ""
            );
            return (
              <Link
                key={d.dateStr}
                href={nav(d.dateStr, "day")}
                aria-current={selected && view === "day" ? "true" : undefined}
                className={`flex min-h-[4.5rem] flex-col items-center justify-center rounded-xl px-1 py-2 text-center transition-colors ${
                  selected && view === "day"
                    ? "bg-[var(--ink)] text-white"
                    : "bg-[var(--surface)] hover:bg-[var(--surface-strong)]"
                }`}
              >
                <span className="text-[0.8125rem] font-medium opacity-80">
                  {d.dayNameShort}
                </span>
                <span
                  className={`tabular text-lg font-semibold ${
                    d.isToday && !(selected && view === "day") ? "underline underline-offset-4" : ""
                  }`}
                >
                  {d.dayNumber}
                </span>
                <span className="hidden max-w-full truncate text-[0.8125rem] opacity-80 sm:block">
                  {place ?? "\u00a0"}
                </span>
              </Link>
            );
          })}
        </nav>

        {view === "day" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
            <div className="flex min-w-0 flex-col gap-5">
              <Card title="Schedule">
                {focal.locationContexts.map((loc) => (
                  <p key={loc.id} className="meta mt-1 inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {loc.physicalLocation ?? loc.title}, {loc.startTimeLocal} to{" "}
                      {loc.endTimeLocal}
                    </span>
                  </p>
                ))}

                {items.length === 0 && (
                  <p className="meta mt-3">Nothing scheduled.</p>
                )}

                <div className="mt-2">
                  {items.map((item) =>
                    item.kind === "task" ? (
                      <div key={item.task.id} className="row">
                        <div className="row-main">
                          <p className="meta tabular">
                            {item.task.startLabel} to {item.task.endLabel}
                          </p>
                          <p className="title">{item.task.title}</p>
                          <p className="meta">
                            <AreaLabel
                              name={item.task.lifeAreaName}
                              token={item.task.colorToken}
                            />
                          </p>
                        </div>
                        {item.task.status === "COMPLETED" ? (
                          <p className="meta-soft">Completed</p>
                        ) : (
                          <div className="row-actions">
                            <form action={completeTaskAction}>
                              <input type="hidden" name="taskId" value={item.task.id} />
                              <button type="submit" className="button button-secondary">
                                <Check className="h-4 w-4" aria-hidden="true" />
                                <span>Done</span>
                              </button>
                            </form>
                            <form action={recoverOrRescheduleTaskAction}>
                              <input type="hidden" name="taskId" value={item.task.id} />
                              <input type="hidden" name="recoveryKind" value="MAKE_FLEXIBLE" />
                              <button type="submit" className="button button-ghost">
                                Unschedule
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div key={item.win.startUtc.toISOString()} className="row">
                        <div className="row-main">
                          <p className="meta-soft tabular">
                            {item.win.startLabel} to {item.win.endLabel}
                          </p>
                          <p className="meta">
                            Free for {formatDuration(item.win.durationMinutes)}
                          </p>
                        </div>
                        <SlotMenu
                          startIso={item.win.startUtc.toISOString()}
                          tasks={flex}
                        />
                      </div>
                    )
                  )}
                </div>
              </Card>

              <Card title="What happened">
                {focal.observedActivities.length === 0 && (
                  <p className="meta mt-2">Nothing logged.</p>
                )}
                {focal.observedActivities.map((act) => (
                  <div key={act.id} className="row">
                    <div className="row-main">
                      <p className="title">{act.title}</p>
                      <p className="meta flex flex-wrap items-center gap-x-3">
                        <span className="tabular">{act.startLabel}</span>
                        {act.lifeAreaName && (
                          <AreaLabel name={act.lifeAreaName} token={act.colorToken} />
                        )}
                        {!act.isConfirmed && (
                          <span className="font-semibold text-[#b45309]">
                            Not confirmed
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            <Card title="Flexible" className="h-fit">
              {flex.length === 0 && <p className="meta mt-2">No flexible tasks.</p>}
              {flex.map((t) => (
                <div key={t.id} className="row">
                  <div className="row-main">
                    <p className="title">{t.title}</p>
                    <p className="meta flex flex-wrap items-center gap-x-3">
                      <AreaLabel name={t.lifeArea.name} token={t.lifeArea.colorToken} />
                      {t.estimatedMinutes && (
                        <span>{formatDuration(t.estimatedMinutes)}</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        ) : (
          <Card>
            {timeline.days.map((day) => (
              <div key={day.dateStr} className="row items-start">
                <div className="w-full sm:w-40 sm:shrink-0">
                  <Link
                    href={nav(day.dateStr, "day")}
                    className={`title ${day.isToday ? "underline underline-offset-4" : ""}`}
                  >
                    {day.dayNameShort} {day.dayNumber} {day.monthShort}
                  </Link>
                  {day.locationContexts.map((loc) => (
                    <p key={loc.id} className="meta-soft">
                      {loc.physicalLocation ?? loc.title}
                    </p>
                  ))}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {day.scheduledCommitments.length === 0 && (
                    <p className="meta-soft">Open</p>
                  )}
                  {day.scheduledCommitments.map((c) => (
                    <p key={c.id} className="flex items-start gap-3">
                      <span className="meta tabular w-12 shrink-0">{c.startLabel}</span>
                      <span className="flex min-w-0 items-start gap-2">
                        <span className="mt-[0.4rem]">
                          <AreaDot token={c.colorToken} />
                        </span>
                        <span>{c.title}</span>
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </OrbitShell>
  );
}
