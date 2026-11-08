import { notFound } from "next/navigation";
import { Undo2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getSingleLifeAreaBySlug } from "@/modules/life-areas/life-area-service";
import { getShellBadgeCounts } from "@/lib/shell-data";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { AreaIconBadge, Card, PageHeader } from "@/components/ui/page";
import { AreaActionsMenu, EditAreaModal } from "@/components/modals/area-modal";
import type { ProjectCardData } from "@/components/areas/project-card";
import type { AreaTaskRowItem } from "@/components/areas/tasks-card";
import {
  SingleAreaClient,
  type SingleAreaActivityItem,
  type SingleAreaRoutineItem,
} from "@/components/areas/single-area-client";
import {
  formatClock,
  formatDays,
  formatDuration,
  formatShortDate,
} from "@/lib/time/format";
import { updateLifeAreaAction } from "@/app/actions/orbit-actions";

export const dynamic = "force-dynamic";

interface SingleAreaPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SingleAreaPage({ params }: SingleAreaPageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { slug } = await params;
  const [data, badges] = await Promise.all([
    getSingleLifeAreaBySlug(user.id, slug),
    getShellBadgeCounts(user.id),
  ]);

  if (!data.area) {
    notFound();
  }

  const { area, lifeAreas, allProjects, ianaTimeZone: tz } = data;
  const areaOptions = lifeAreas.map((a) => ({ id: a.id, name: a.name }));

  const projectCards: ProjectCardData[] = area.projects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    kind: p.kind,
    lifeAreaId: p.lifeAreaId,
    lifeArea: {
      name: area.name,
      slug: area.slug,
      colorToken: area.colorToken,
    },
    milestones: p.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
    })),
  }));

  const taskRows: AreaTaskRowItem[] = area.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    commitmentType: t.commitmentType,
    estimatedMinutes: t.estimatedMinutes,
    waitingOnPerson: t.waitingOnPerson,
    scheduledLabel: t.scheduledStart
      ? `${formatShortDate(t.scheduledStart, tz)} ${formatClock(
          t.scheduledStart,
          tz
        )}`
      : null,
    projectTitle: t.project?.title ?? null,
    lifeArea: {
      name: area.name,
      slug: area.slug,
      colorToken: area.colorToken,
    },
  }));

  const routineItems: SingleAreaRoutineItem[] = area.routines.map((r) => ({
    id: r.id,
    title: r.title,
    daysLabel: formatDays(r.daysOfWeek),
    timeRangeLabel: `${r.startTimeLocal} to ${r.endTimeLocal}`,
    physicalLocation: r.physicalLocation,
  }));

  const activityItems: SingleAreaActivityItem[] = area.activityRecords.map(
    (act) => ({
      id: act.id,
      title: act.title,
      whenLabel: `${formatShortDate(act.startedAt, tz)}, ${formatClock(
        act.startedAt,
        tz
      )}`,
      durationLabel: act.durationMinutes
        ? formatDuration(act.durationMinutes)
        : null,
    })
  );

  const openTaskCount = area.tasks.filter(
    (t) => t.status !== "COMPLETED"
  ).length;

  return (
    <OrbitShell
      lifeAreas={lifeAreas}
      projects={allProjects}
      unreviewedInboxCount={badges.unreviewedInboxCount}
      unreadCheckInCount={badges.unreadCheckInCount}
      user={{
        name: user.name,
        email: user.email,
      }}
    >
      <div className="page">
        <PageHeader
          title={area.name}
          leading={
            <AreaIconBadge
              iconName={area.iconName}
              token={area.colorToken}
              size="sm"
            />
          }
          subtitle={area.description ?? undefined}
          breadcrumbs={[
            { label: "Areas", href: "/areas" },
            { label: area.name },
          ]}
        >
          <EditAreaModal
            area={{
              id: area.id,
              name: area.name,
              colorToken: area.colorToken,
              iconName: area.iconName,
              description: area.description,
              isArchived: area.isArchived,
              projectCount: area.projects.length,
              openTaskCount,
            }}
            triggerLabel="Edit"
            triggerClassName="btn btn-secondary btn-sm"
          />
          <AreaActionsMenu
            area={{
              id: area.id,
              name: area.name,
              colorToken: area.colorToken,
              iconName: area.iconName,
              description: area.description,
              isArchived: area.isArchived,
              projectCount: area.projects.length,
              openTaskCount,
            }}
            includeEdit={false}
            redirectOnDeleteTo="/areas"
          />
        </PageHeader>

        {area.isArchived && (
          <Card title="Archived area">
            <div className="orbit-row">
              <p className="meta orbit-row-main">
                This area is archived and hidden from active filters.
              </p>
              <form action={updateLifeAreaAction}>
                <input type="hidden" name="areaId" value={area.id} />
                <input type="hidden" name="operation" value="RESTORE" />
                <button type="submit" className="btn btn-secondary btn-sm">
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  <span>Restore</span>
                </button>
              </form>
            </div>
          </Card>
        )}

        <SingleAreaClient
          areaId={area.id}
          areaName={area.name}
          areaOptions={areaOptions}
          projects={projectCards}
          tasks={taskRows}
          routines={routineItems}
          activities={activityItems}
        />
      </div>
    </OrbitShell>
  );
}
