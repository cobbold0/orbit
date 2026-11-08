import { getCurrentUser } from "@/lib/auth/session";
import { getLifeAreasAndProjectsData } from "@/modules/life-areas/life-area-service";
import { getShellBadgeCounts } from "@/lib/shell-data";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { PageHeader } from "@/components/ui/page";
import { ProjectModal } from "@/components/modals/project-modal";
import { AllProjectsClient } from "@/components/areas/all-projects-client";
import type { FilterableAreaItem } from "@/components/areas/area-filter-bar";
import type { ProjectCardData } from "@/components/areas/project-card";

export const dynamic = "force-dynamic";

interface AllProjectsPageProps {
  searchParams: Promise<{ area?: string }>;
}

export default async function AllProjectsPage({
  searchParams,
}: AllProjectsPageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const [data, badges] = await Promise.all([
    getLifeAreasAndProjectsData(user.id),
    getShellBadgeCounts(user.id),
  ]);

  const selected = data.lifeAreas.find((a) => a.slug === params.area);

  const areaItems: FilterableAreaItem[] = data.lifeAreas.map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    colorToken: a.colorToken,
    openTaskCount: a.tasks.filter((t) => t.status !== "COMPLETED").length,
  }));

  const areaOptions = data.lifeAreas.map((a) => ({ id: a.id, name: a.name }));

  const scopedProjects = selected
    ? data.projects.filter((p) => p.lifeAreaId === selected.id)
    : data.projects;

  const projectCards: ProjectCardData[] = scopedProjects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    kind: p.kind,
    lifeAreaId: p.lifeAreaId,
    lifeArea: {
      name: p.lifeArea.name,
      slug: p.lifeArea.slug,
      colorToken: p.lifeArea.colorToken,
    },
    milestones: p.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
    })),
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
          title="Projects"
          breadcrumbs={[
            { label: "Areas", href: "/areas" },
            { label: "Projects" },
          ]}
        >
          <ProjectModal
            mode="create"
            lifeAreas={areaOptions}
            defaultAreaId={selected?.id}
            triggerClassName="btn btn-primary btn-sm sm:btn-md"
          />
        </PageHeader>

        <AllProjectsClient
          areas={areaItems}
          areaOptions={areaOptions}
          selectedSlug={selected?.slug}
          selectedAreaId={selected?.id}
          projects={projectCards}
        />
      </div>
    </OrbitShell>
  );
}
