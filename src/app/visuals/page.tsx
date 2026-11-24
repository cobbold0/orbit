import { redirect } from "next/navigation";
import { TaskStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getShellBadgeCounts } from "@/lib/shell-data";
import { OrbitShell } from "@/components/shell/orbit-shell";
import {
  MiroStreamCanvas,
  StreamEdgeData,
  StreamNodeData,
} from "@/components/visuals/miro-stream-canvas";
import { formatClockRange } from "@/lib/time/format";
import { getOrCreateUserPreferences } from "@/modules/notifications/notification-service";

export const dynamic = "force-dynamic";

export default async function VisualsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [pref, lifeAreas, projects, tasks, routines, badges] =
    await Promise.all([
      getOrCreateUserPreferences(user.id),
      prisma.lifeArea.findMany({
        where: { userId: user.id, isArchived: false },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.project.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: {
          lifeArea: true,
          milestones: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.task.findMany({
        where: {
          userId: user.id,
          status: { notIn: [TaskStatus.ARCHIVED] },
        },
        include: { lifeArea: true, project: true },
        orderBy: [{ commitmentType: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.routine.findMany({
        where: { userId: user.id, isActive: true },
        include: { lifeArea: true },
        orderBy: { createdAt: "asc" },
      }),
      getShellBadgeCounts(user.id),
    ]);

  const tz = pref.ianaTimeZone;

  // Build stream layout coordinates (Life Area -> Project/Routine -> Milestone -> Task)
  const nodes: StreamNodeData[] = [];
  const edges: StreamEdgeData[] = [];

  let currentY = 40;

  for (const area of lifeAreas) {
    const areaY = currentY;
    const areaNodeId = `area_${area.id}`;

    nodes.push({
      id: areaNodeId,
      type: "AREA",
      title: area.name,
      subtitle: area.description || undefined,
      colorToken: area.colorToken,
      lifeAreaName: area.name,
      lifeAreaSlug: area.slug,
      x: 40,
      y: areaY,
    });

    const areaProjects = projects.filter((p) => p.lifeAreaId === area.id);
    const areaRoutines = routines.filter((r) => r.lifeAreaId === area.id);

    let streamSubY = areaY;

    // Connect Routines under this area
    for (const routine of areaRoutines) {
      const routineNodeId = `routine_${routine.id}`;
      nodes.push({
        id: routineNodeId,
        type: "ROUTINE",
        title: routine.title,
        subtitle: routine.description || undefined,
        timeLabel: `${routine.startTimeLocal} - ${routine.endTimeLocal}`,
        colorToken: area.colorToken,
        lifeAreaName: area.name,
        lifeAreaSlug: area.slug,
        parentId: areaNodeId,
        x: 360,
        y: streamSubY,
      });

      edges.push({
        id: `edge_${areaNodeId}_${routineNodeId}`,
        sourceId: areaNodeId,
        targetId: routineNodeId,
        colorToken: area.colorToken,
      });

      streamSubY += 150;
    }

    // Connect Projects under this area
    for (const project of areaProjects) {
      const projNodeId = `project_${project.id}`;
      const projectMilestones = project.milestones;
      const completedMilestones = projectMilestones.filter(
        (m) => m.status === "COMPLETED"
      ).length;
      const progressPercent =
        projectMilestones.length > 0
          ? Math.round(
              (completedMilestones / projectMilestones.length) * 100
            )
          : undefined;

      nodes.push({
        id: projNodeId,
        type: "PROJECT",
        title: project.title,
        subtitle: project.description || undefined,
        colorToken: area.colorToken,
        progressPercent,
        lifeAreaName: area.name,
        lifeAreaSlug: area.slug,
        parentId: areaNodeId,
        x: 360,
        y: streamSubY,
      });

      edges.push({
        id: `edge_${areaNodeId}_${projNodeId}`,
        sourceId: areaNodeId,
        targetId: projNodeId,
        colorToken: area.colorToken,
      });

      let milestoneSubY = streamSubY;

      // Connect Milestones under project
      for (const milestone of projectMilestones) {
        const msNodeId = `ms_${milestone.id}`;
        nodes.push({
          id: msNodeId,
          type: "MILESTONE",
          title: milestone.title,
          subtitle: milestone.targetDate
            ? `Target: ${milestone.targetDate}`
            : undefined,
          status: milestone.status,
          colorToken: area.colorToken,
          lifeAreaName: area.name,
          lifeAreaSlug: area.slug,
          parentId: projNodeId,
          x: 680,
          y: milestoneSubY,
        });

        edges.push({
          id: `edge_${projNodeId}_${msNodeId}`,
          sourceId: projNodeId,
          targetId: msNodeId,
          colorToken: area.colorToken,
        });

        milestoneSubY += 140;
      }

      // Connect Tasks under project
      const projectTasks = tasks.filter((t) => t.projectId === project.id);
      let taskSubY = streamSubY;

      for (const task of projectTasks) {
        const taskNodeId = `task_${task.id}`;
        const timeLabel =
          task.scheduledStart && task.scheduledEnd
            ? formatClockRange(task.scheduledStart, task.scheduledEnd, tz)
            : task.estimatedMinutes
              ? `${task.estimatedMinutes}m`
              : undefined;

        nodes.push({
          id: taskNodeId,
          type: "TASK",
          title: task.title,
          subtitle: task.contextNotes || undefined,
          status: task.status,
          timeLabel,
          waitingOnPerson: task.waitingOnPerson,
          colorToken: area.colorToken,
          lifeAreaName: area.name,
          lifeAreaSlug: area.slug,
          parentId: projNodeId,
          x: 1000,
          y: taskSubY,
        });

        edges.push({
          id: `edge_${projNodeId}_${taskNodeId}`,
          sourceId: projNodeId,
          targetId: taskNodeId,
          colorToken: area.colorToken,
        });

        taskSubY += 150;
      }

      streamSubY = Math.max(streamSubY + 160, milestoneSubY, taskSubY);
    }

    currentY = Math.max(currentY + 220, streamSubY + 80);
  }

  return (
    <OrbitShell
      lifeAreas={lifeAreas}
      projects={projects}
      unreviewedInboxCount={badges.unreviewedInboxCount}
      unreadCheckInCount={badges.unreadCheckInCount}
      user={{
        name: user.name,
        email: user.email,
      }}
    >
      <div className="w-full h-full p-0 m-0 overflow-hidden">
        {/* Miro-Style Infinite Canvas filling entire screen */}
        <MiroStreamCanvas
          initialNodes={nodes}
          initialEdges={edges}
          lifeAreas={lifeAreas.map((a) => ({
            id: a.id,
            name: a.name,
            slug: a.slug,
            colorToken: a.colorToken,
          }))}
        />
      </div>
    </OrbitShell>
  );
}
