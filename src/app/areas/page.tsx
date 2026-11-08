import Link from "next/link";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  MoreHorizontal,
  Plus,
  Undo2,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getLifeAreasAndProjectsData } from "@/modules/life-areas/life-area-service";
import { getUnreviewedInboxActionCount } from "@/lib/shell-data";
import { OrbitShell } from "@/components/shell/orbit-shell";
import { AreaDot, AreaLabel, Card, Dropdown, PageHeader } from "@/components/ui/page";
import { LIFE_AREA_STYLES } from "@/lib/design/tokens";
import { formatDuration } from "@/lib/time/format";
import {
  addMilestoneAction,
  completeTaskAction,
  createLifeAreaAction,
  createProjectAction,
  cycleMilestoneAction,
  recoverOrRescheduleTaskAction,
  updateLifeAreaAction,
} from "@/app/actions/orbit-actions";

export const dynamic = "force-dynamic";

interface AreasPageProps {
  searchParams: Promise<{ area?: string }>;
}

const MILESTONE_LABEL = {
  UPCOMING: "Upcoming",
  IN_PROGRESS: "In progress",
  COMPLETED: "Done",
} as const;

export default async function AreasPage({ searchParams }: AreasPageProps) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const [data, unreviewedInboxCount] = await Promise.all([
    getLifeAreasAndProjectsData(user.id),
    getUnreviewedInboxActionCount(user.id),
  ]);

  const selected = data.lifeAreas.find((a) => a.slug === params.area);
  const projects = selected
    ? data.projects.filter((p) => p.lifeAreaId === selected.id)
    : data.projects;
  const tasks = selected
    ? data.tasks.filter((t) => t.lifeAreaId === selected.id)
    : data.tasks;

  const shellProjects = data.projects.map((p) => ({
    id: p.id,
    title: p.title,
    lifeAreaId: p.lifeAreaId,
  }));

  return (
    <OrbitShell
      lifeAreas={data.lifeAreas}
      projects={shellProjects}
      unreviewedInboxCount={unreviewedInboxCount}
    >
      <div className="page">
        <PageHeader title={selected ? selected.name : "Areas"}>
          <Dropdown
            label="New project"
            variant="primary"
            icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            form
          >
            <form action={createProjectAction} className="space-y-3">
              <div>
                <label htmlFor="np-title" className="label">
                  Title
                </label>
                <input id="np-title" name="title" required className="field" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="np-area" className="label">
                    Area
                  </label>
                  <select
                    id="np-area"
                    name="lifeAreaId"
                    defaultValue={selected?.id ?? data.lifeAreas[0]?.id ?? ""}
                    className="field"
                  >
                    {data.lifeAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="np-kind" className="label">
                    Type
                  </label>
                  <select id="np-kind" name="kind" defaultValue="PROJECT" className="field">
                    <option value="PROJECT">Project</option>
                    <option value="JOURNEY">Journey</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="np-desc" className="label">
                  Description
                </label>
                <textarea id="np-desc" name="description" rows={2} className="field" />
              </div>
              <div>
                <label htmlFor="np-ms" className="label">
                  Milestones, one per line
                </label>
                <textarea id="np-ms" name="milestonesRaw" rows={3} className="field" />
              </div>
              <button type="submit" className="button button-primary w-full">
                Create
              </button>
            </form>
          </Dropdown>
        </PageHeader>

        <nav aria-label="Filter by area" className="flex flex-wrap gap-2">
          <Link href="/areas" className="chip" aria-current={!selected ? "true" : undefined}>
            All
          </Link>
          {data.lifeAreas.map((a) => (
            <Link
              key={a.id}
              href={`/areas?area=${a.slug}`}
              className="chip"
              aria-current={selected?.id === a.id ? "true" : undefined}
            >
              <AreaDot token={a.colorToken} />
              <span>{a.name}</span>
            </Link>
          ))}
        </nav>

        {/* Projects */}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {projects.map((project) => {
            const done = project.milestones.filter((m) => m.status === "COMPLETED").length;
            const total = project.milestones.length;
            return (
              <Card key={project.id}>
                <h2 className="h2">{project.title}</h2>
                <p className="meta mt-1 flex flex-wrap items-center gap-x-3">
                  <AreaLabel
                    name={project.lifeArea.name}
                    token={project.lifeArea.colorToken}
                  />
                  <span>{project.kind === "JOURNEY" ? "Journey" : "Project"}</span>
                </p>
                {project.description && (
                  <p className="mt-3 text-[0.9375rem] text-[var(--text-2)]">
                    {project.description}
                  </p>
                )}

                {total > 0 && (
                  <div className="mt-4">
                    <div className="meta mb-2 flex justify-between">
                      <span>Milestones</span>
                      <span className="tabular">
                        {done} of {total}
                      </span>
                    </div>
                    <progress
                      className="bar"
                      value={done}
                      max={total}
                      aria-label={`${done} of ${total} milestones done`}
                    />
                    <ol className="mt-1">
                      {project.milestones.map((ms) => (
                        <li key={ms.id} className="row">
                          <p
                            className={`row-main ${
                              ms.status === "COMPLETED"
                                ? "text-[var(--text-3)] line-through"
                                : ms.status === "IN_PROGRESS"
                                  ? "font-semibold"
                                  : ""
                            }`}
                          >
                            {ms.title}
                          </p>
                          <form action={cycleMilestoneAction}>
                            <input type="hidden" name="milestoneId" value={ms.id} />
                            <button
                              type="submit"
                              aria-label={`${ms.title}: ${MILESTONE_LABEL[ms.status]}. Change status`}
                              className="button button-ghost"
                            >
                              {ms.status === "COMPLETED" ? (
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              ) : ms.status === "IN_PROGRESS" ? (
                                <CircleDot className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <Circle className="h-4 w-4" aria-hidden="true" />
                              )}
                              <span>{MILESTONE_LABEL[ms.status]}</span>
                            </button>
                          </form>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="mt-3">
                  <Dropdown
                    label="Add step"
                    variant="ghost"
                    align="start"
                    form
                    icon={<Plus className="h-4 w-4" aria-hidden="true" />}
                  >
                    <form action={addMilestoneAction} className="space-y-3">
                      <input type="hidden" name="projectId" value={project.id} />
                      <div>
                        <label htmlFor={`ms-${project.id}`} className="label">
                          Next milestone
                        </label>
                        <input
                          id={`ms-${project.id}`}
                          name="title"
                          required
                          className="field"
                        />
                      </div>
                      <button type="submit" className="button button-primary w-full">
                        Add
                      </button>
                    </form>
                  </Dropdown>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Tasks by type */}
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {(
            [
              ["SCHEDULED", "Scheduled"],
              ["FLEXIBLE", "Flexible"],
              ["WAITING", "Waiting"],
            ] as const
          ).map(([type, title]) => {
            const list = tasks.filter(
              (t) => t.commitmentType === type && t.status !== "COMPLETED"
            );
            return (
              <Card key={type} title={title}>
                {list.length === 0 && <p className="meta mt-2">None.</p>}
                {list.map((task) => (
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
                      </p>
                      {task.waitingOnPerson && (
                        <p className="meta">Waiting on {task.waitingOnPerson}</p>
                      )}
                    </div>
                    <div className="row-actions">
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
                      {type !== "FLEXIBLE" && (
                        <Dropdown
                          iconOnly
                          variant="ghost"
                          ariaLabel={`More actions for ${task.title}`}
                          icon={<MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
                        >
                          <form action={recoverOrRescheduleTaskAction}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <input type="hidden" name="recoveryKind" value="MAKE_FLEXIBLE" />
                            <button type="submit" className="menu-item">
                              Make flexible
                            </button>
                          </form>
                        </Dropdown>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>

        {/* Manage areas */}
        <Card
          title="Manage areas"
          action={
            <Dropdown
              label="New area"
              variant="secondary"
              form
              icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              <form action={createLifeAreaAction} className="space-y-3">
                <div>
                  <label htmlFor="na-name" className="label">
                    Name
                  </label>
                  <input id="na-name" name="name" required className="field" />
                </div>
                <div>
                  <label htmlFor="na-color" className="label">
                    Colour
                  </label>
                  <select id="na-color" name="colorToken" defaultValue="teal" className="field">
                    {Object.values(LIFE_AREA_STYLES).map((s) => (
                      <option key={s.token} value={s.token}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="button button-primary w-full">
                  Create
                </button>
              </form>
            </Dropdown>
          }
        >
          {data.lifeAreas.map((area, i) => (
            <div key={area.id} className="row">
              <p className="title row-main">
                <AreaLabel name={area.name} token={area.colorToken} />
              </p>
              <div className="row-actions">
                <Dropdown label="Rename" variant="ghost" form>
                  <form action={updateLifeAreaAction} className="space-y-3">
                    <input type="hidden" name="areaId" value={area.id} />
                    <input type="hidden" name="operation" value="RENAME" />
                    <div>
                      <label htmlFor={`rn-${area.id}`} className="label">
                        Name
                      </label>
                      <input
                        id={`rn-${area.id}`}
                        name="name"
                        defaultValue={area.name}
                        required
                        className="field"
                      />
                    </div>
                    <button type="submit" className="button button-primary w-full">
                      Save
                    </button>
                  </form>
                </Dropdown>
                <form action={updateLifeAreaAction}>
                  <input type="hidden" name="areaId" value={area.id} />
                  <input type="hidden" name="operation" value="MOVE_UP" />
                  <button
                    type="submit"
                    disabled={i === 0}
                    aria-label={`Move ${area.name} up`}
                    className="button button-ghost button-icon"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
                <form action={updateLifeAreaAction}>
                  <input type="hidden" name="areaId" value={area.id} />
                  <input type="hidden" name="operation" value="MOVE_DOWN" />
                  <button
                    type="submit"
                    disabled={i === data.lifeAreas.length - 1}
                    aria-label={`Move ${area.name} down`}
                    className="button button-ghost button-icon"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
                <form action={updateLifeAreaAction}>
                  <input type="hidden" name="areaId" value={area.id} />
                  <input type="hidden" name="operation" value="ARCHIVE" />
                  <button
                    type="submit"
                    aria-label={`Archive ${area.name}`}
                    className="button button-ghost button-icon"
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
              </div>
            </div>
          ))}
          {data.archivedAreas.map((area) => (
            <div key={area.id} className="row">
              <p className="meta row-main">{area.name} (archived)</p>
              <form action={updateLifeAreaAction}>
                <input type="hidden" name="areaId" value={area.id} />
                <input type="hidden" name="operation" value="RESTORE" />
                <button type="submit" className="button button-ghost">
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  <span>Restore</span>
                </button>
              </form>
            </div>
          ))}
        </Card>
      </div>
    </OrbitShell>
  );
}
