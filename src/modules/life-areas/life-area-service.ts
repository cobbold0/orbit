import {
  MilestoneStatus,
  ProjectKind,
  ProjectStatus,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function getLifeAreasAndProjectsData(userId: string) {
  const [lifeAreas, archivedAreas, projects, tasks] = await Promise.all([
    prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      include: {
        projects: {
          where: { status: { not: ProjectStatus.ARCHIVED } },
          include: {
            milestones: { orderBy: { sortOrder: "asc" } },
            tasks: {
              where: { status: { not: TaskStatus.ARCHIVED } },
              orderBy: [{ status: "asc" }, { priority: "desc" }],
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        tasks: {
          where: { status: { not: TaskStatus.ARCHIVED } },
          include: { project: true, milestone: true },
          orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
        },
        routines: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
        },
        activityRecords: {
          orderBy: { startedAt: "desc" },
          take: 5,
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.lifeArea.findMany({
      where: { userId, isArchived: true },
      include: {
        projects: {
          where: { status: { not: ProjectStatus.ARCHIVED } },
          select: { id: true },
        },
        tasks: {
          where: { status: { not: TaskStatus.ARCHIVED } },
          select: { id: true, status: true },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.project.findMany({
      where: { userId, status: { not: ProjectStatus.ARCHIVED } },
      include: {
        lifeArea: true,
        milestones: { orderBy: { sortOrder: "asc" } },
        tasks: {
          where: { status: { not: TaskStatus.ARCHIVED } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.task.findMany({
      where: { userId, status: { not: TaskStatus.ARCHIVED } },
      include: {
        lifeArea: true,
        project: true,
        milestone: true,
        dependencies: {
          include: { prerequisiteTask: true },
        },
        scheduleHistory: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return {
    lifeAreas,
    archivedAreas,
    projects,
    tasks,
  };
}

export async function createLifeArea(
  userId: string,
  input: {
    name: string;
    description?: string;
    colorToken: string;
    iconName?: string;
  }
) {
  const baseSlug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const reserved = new Set(["manage", "tasks", "projects"]);
  const safeBase =
    !baseSlug || reserved.has(baseSlug) ? `area-${Date.now()}` : baseSlug;

  const existing = await prisma.lifeArea.findFirst({
    where: { userId, slug: safeBase },
    select: { id: true },
  });
  const slug = existing
    ? `${safeBase}-${Math.floor(Math.random() * 900 + 100)}`
    : safeBase;

  const maxSort = await prisma.lifeArea.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });

  return prisma.lifeArea.create({
    data: {
      userId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      colorToken: input.colorToken,
      iconName: input.iconName || "CircleDot",
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
}

export async function updateLifeArea(
  userId: string,
  areaId: string,
  input: {
    name?: string;
    description?: string;
    colorToken?: string;
    iconName?: string;
    isArchived?: boolean;
    direction?: "UP" | "DOWN";
  }
) {
  const area = await prisma.lifeArea.findFirst({
    where: { id: areaId, userId },
  });
  if (!area) throw new Error("Life area not found");

  if (input.direction) {
    const all = await prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      orderBy: { sortOrder: "asc" },
    });
    const idx = all.findIndex((a) => a.id === areaId);
    const swapIdx = input.direction === "UP" ? idx - 1 : idx + 1;
    const neighbor = all[swapIdx];
    if (idx !== -1 && neighbor) {
      await prisma.$transaction([
        prisma.lifeArea.update({
          where: { id: area.id },
          data: { sortOrder: neighbor.sortOrder },
        }),
        prisma.lifeArea.update({
          where: { id: neighbor.id },
          data: { sortOrder: area.sortOrder },
        }),
      ]);
    }
    return area;
  }

  return prisma.lifeArea.update({
    where: { id: area.id },
    data: {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() || null }
        : {}),
      ...(input.colorToken ? { colorToken: input.colorToken } : {}),
      ...(input.iconName ? { iconName: input.iconName } : {}),
      ...(input.isArchived !== undefined
        ? {
            isArchived: input.isArchived,
            archivedAt: input.isArchived ? new Date() : null,
          }
        : {}),
    },
  });
}

export async function reorderLifeAreas(
  userId: string,
  orderedAreaIds: string[]
) {
  if (orderedAreaIds.length === 0) return;

  const owned = await prisma.lifeArea.findMany({
    where: { userId, id: { in: orderedAreaIds } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((a) => a.id));
  const validIds = orderedAreaIds.filter((id) => ownedSet.has(id));
  if (validIds.length === 0) return;

  await prisma.$transaction(
    validIds.map((id, idx) =>
      prisma.lifeArea.update({
        where: { id },
        data: { sortOrder: idx + 1 },
      })
    )
  );
}

export async function deleteLifeArea(userId: string, areaId: string) {
  const [area, totalCount] = await Promise.all([
    prisma.lifeArea.findFirst({ where: { id: areaId, userId } }),
    prisma.lifeArea.count({ where: { userId } }),
  ]);

  if (!area) throw new Error("Life area not found");
  if (totalCount <= 1) {
    throw new Error("Keep at least one life area in Orbit.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.deleteMany({ where: { userId, lifeAreaId: area.id } });
    await tx.project.deleteMany({ where: { userId, lifeAreaId: area.id } });
    await tx.lifeArea.delete({ where: { id: area.id } });
  });
}

export async function createProjectOrJourney(
  userId: string,
  input: {
    lifeAreaId: string;
    title: string;
    description?: string;
    contextNote?: string;
    kind: ProjectKind;
    targetDate?: Date | null;
    initialMilestones?: string[];
  }
) {
  const maxSort = await prisma.project.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });

  return prisma.project.create({
    data: {
      userId,
      lifeAreaId: input.lifeAreaId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      contextNote: input.contextNote?.trim() || null,
      kind: input.kind,
      targetDate: input.targetDate ?? null,
      startDate: new Date(),
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      milestones:
        input.initialMilestones && input.initialMilestones.length > 0
          ? {
              create: input.initialMilestones.map((mTitle, idx) => ({
                title: mTitle.trim(),
                sortOrder: idx + 1,
                status:
                  idx === 0
                    ? MilestoneStatus.IN_PROGRESS
                    : MilestoneStatus.UPCOMING,
              })),
            }
          : undefined,
    },
  });
}

export async function addMilestoneToProject(
  userId: string,
  projectId: string,
  title: string
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { milestones: true },
  });
  if (!project) throw new Error("Project not found");

  const nextSort =
    project.milestones.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1;

  return prisma.projectMilestone.create({
    data: {
      projectId: project.id,
      title: title.trim(),
      sortOrder: nextSort,
      status:
        project.milestones.length === 0
          ? MilestoneStatus.IN_PROGRESS
          : MilestoneStatus.UPCOMING,
    },
  });
}

export async function cycleMilestoneStatus(
  userId: string,
  milestoneId: string
) {
  const milestone = await prisma.projectMilestone.findFirst({
    where: { id: milestoneId, project: { userId } },
    include: { project: true },
  });
  if (!milestone) throw new Error("Milestone not found");

  const nextStatus =
    milestone.status === MilestoneStatus.UPCOMING
      ? MilestoneStatus.IN_PROGRESS
      : milestone.status === MilestoneStatus.IN_PROGRESS
        ? MilestoneStatus.COMPLETED
        : MilestoneStatus.UPCOMING;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.projectMilestone.update({
      where: { id: milestone.id },
      data: {
        status: nextStatus,
        completedAt:
          nextStatus === MilestoneStatus.COMPLETED ? new Date() : null,
      },
    });

    if (nextStatus === MilestoneStatus.COMPLETED) {
      await tx.activityRecord.create({
        data: {
          userId,
          lifeAreaId: milestone.project.lifeAreaId,
          projectId: milestone.projectId,
          milestoneId: milestone.id,
          title: `Completed milestone: ${milestone.title}`,
          startedAt: new Date(),
          durationMinutes: 30,
          source: "TASK_COMPLETION",
          isConfirmed: true,
        },
      });
    }

    return updated;
  });
}

export async function updateProjectOrJourney(
  userId: string,
  projectId: string,
  input: {
    title?: string;
    description?: string;
    lifeAreaId?: string;
    kind?: ProjectKind;
    status?: ProjectStatus;
  }
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new Error("Project not found");

  return prisma.project.update({
    where: { id: project.id },
    data: {
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() || null }
        : {}),
      ...(input.lifeAreaId ? { lifeAreaId: input.lifeAreaId } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

export async function getSingleLifeAreaBySlug(userId: string, slug: string) {
  const [pref, area, lifeAreas, allProjects] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.lifeArea.findFirst({
      where: { userId, slug },
      include: {
        projects: {
          where: { status: { not: ProjectStatus.ARCHIVED } },
          include: {
            milestones: { orderBy: { sortOrder: "asc" } },
            tasks: {
              where: { status: { not: TaskStatus.ARCHIVED } },
              orderBy: [{ status: "asc" }, { priority: "desc" }],
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        tasks: {
          where: { status: { not: TaskStatus.ARCHIVED } },
          include: { project: true, milestone: true, lifeArea: true },
          orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
        },
        routines: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
        },
        activityRecords: {
          orderBy: { startedAt: "desc" },
          take: 10,
        },
      },
    }),
    prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.project.findMany({
      where: { userId, status: ProjectStatus.ACTIVE },
      select: { id: true, title: true, lifeAreaId: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return {
    ianaTimeZone: pref?.ianaTimeZone ?? "Africa/Lagos",
    area,
    lifeAreas,
    allProjects,
  };
}
