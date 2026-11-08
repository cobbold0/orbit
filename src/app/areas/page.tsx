import { getCurrentUser } from "@/lib/auth/session";
import { getLifeAreasAndProjectsData } from "@/modules/life-areas/life-area-service";
import { getShellBadgeCounts } from "@/lib/shell-data";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { PageHeader } from "@/components/ui/page";
import { CreateAreaModal } from "@/components/modals/area-modal";
import {
  AreasOverviewClient,
  type AreaCardItem,
} from "@/components/areas/areas-overview-client";

export const dynamic = "force-dynamic";

export default async function AreasPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [data, badges] = await Promise.all([
    getLifeAreasAndProjectsData(user.id),
    getShellBadgeCounts(user.id),
  ]);

  const activeAreas: AreaCardItem[] = data.lifeAreas.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    colorToken: a.colorToken,
    iconName: a.iconName,
    description: a.description,
    isArchived: a.isArchived,
    projectCount: a.projects.length,
    openTaskCount: a.tasks.filter((t) => t.status !== "COMPLETED").length,
  }));

  const archivedAreas: AreaCardItem[] = data.archivedAreas.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    colorToken: a.colorToken,
    iconName: a.iconName,
    description: a.description,
    isArchived: a.isArchived,
    projectCount: a.projects.length,
    openTaskCount: a.tasks.filter((t) => t.status !== "COMPLETED").length,
  }));

  const totalOpenTasksCount = data.tasks.filter(
    (t) => t.status !== "COMPLETED"
  ).length;

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
        <PageHeader title="Areas">
          <CreateAreaModal />
        </PageHeader>

        <AreasOverviewClient
          activeAreas={activeAreas}
          archivedAreas={archivedAreas}
          totalProjectsCount={data.projects.length}
          totalOpenTasksCount={totalOpenTasksCount}
        />
      </div>
    </OrbitShell>
  );
}
