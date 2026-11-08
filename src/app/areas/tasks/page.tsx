import { getCurrentUser } from "@/lib/auth/session";
import { getLifeAreasAndProjectsData } from "@/modules/life-areas/life-area-service";
import { getShellBadgeCounts } from "@/lib/shell-data";
import { OpenCaptureButton, OrbitShell } from "@/components/shell/orbit-shell";
import { PageHeader } from "@/components/ui/page";
import { AllTasksClient } from "@/components/areas/all-tasks-client";
import type { FilterableAreaItem } from "@/components/areas/area-filter-bar";
import type { AreaTaskRowItem } from "@/components/areas/tasks-card";
import { prisma } from "@/lib/db/prisma";
import { formatClock, formatShortDate } from "@/lib/time/format";

export const dynamic = "force-dynamic";

interface AllTasksPageProps {
  searchParams: Promise<{ area?: string }>;
}

export default async function AllTasksPage({
  searchParams,
}: AllTasksPageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const [pref, data, badges] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    getLifeAreasAndProjectsData(user.id),
    getShellBadgeCounts(user.id),
  ]);

  const tz = pref?.ianaTimeZone ?? "Africa/Lagos";
  const selected = data.lifeAreas.find((a) => a.slug === params.area);

  const areaItems: FilterableAreaItem[] = data.lifeAreas.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    colorToken: a.colorToken,
    openTaskCount: a.tasks.filter((t) => t.status !== "COMPLETED").length,
  }));

  const scopedTasks = selected
    ? data.tasks.filter((t) => t.lifeAreaId === selected.id)
    : data.tasks;

  const taskRows: AreaTaskRowItem[] = scopedTasks.map((t) => ({
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
      name: t.lifeArea.name,
      slug: t.lifeArea.slug,
      colorToken: t.lifeArea.colorToken,
    },
  }));

  const shellProjects = data.projects.map((p) => ({
    id: p.id,
    title: p.title,
    lifeAreaId: p.lifeAreaId,
  }));

  return (
    <OrbitShell
      lifeAreas={data.lifeAreas}
      projects={shellProjects}
      unreviewedInboxCount={badges.unreviewedInboxCount}
      unreadCheckInCount={badges.unreadCheckInCount}
    >
      <div className="page">
        <PageHeader
          title="Open tasks"
          breadcrumbs={[
            { label: "Areas", href: "/areas" },
            { label: "Open tasks" },
          ]}
        >
          <OpenCaptureButton
            defaultAreaId={selected?.id}
            mode="task"
            label="New task"
            className="btn btn-primary btn-sm sm:btn-md"
          />
        </PageHeader>

        <AllTasksClient
          areas={areaItems}
          selectedSlug={selected?.slug}
          tasks={taskRows}
        />
      </div>
    </OrbitShell>
  );
}
