import { ActivitySource, RoutineKind, RoutineState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function getActivityAndRoutinesData(userId: string) {
  const [pref, lifeAreas, activityRecords, routines] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.activityRecord.findMany({
      where: { userId },
      include: {
        lifeArea: true,
        project: true,
        milestone: true,
        task: true,
      },
      orderBy: { startedAt: "desc" },
      take: 40,
    }),
    prisma.routine.findMany({
      where: { userId, isActive: true },
      include: { lifeArea: true },
      orderBy: [{ state: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";

  // Compute time distribution across Life Areas (strictly separating Confirmed vs. Inferred)
  const distributionMap = new Map<
    string,
    {
      lifeAreaId: string;
      name: string;
      colorToken: string;
      confirmedMinutes: number;
      inferredMinutes: number;
      entryCount: number;
    }
  >();

  for (const area of lifeAreas) {
    distributionMap.set(area.id, {
      lifeAreaId: area.id,
      name: area.name,
      colorToken: area.colorToken,
      confirmedMinutes: 0,
      inferredMinutes: 0,
      entryCount: 0,
    });
  }

  let totalConfirmedMinutes = 0;
  let totalInferredMinutes = 0;

  for (const rec of activityRecords) {
    const mins = rec.durationMinutes ?? 30;
    if (rec.isConfirmed) {
      totalConfirmedMinutes += mins;
    } else {
      totalInferredMinutes += mins;
    }

    if (rec.lifeAreaId && distributionMap.has(rec.lifeAreaId)) {
      const bucket = distributionMap.get(rec.lifeAreaId)!;
      bucket.entryCount += 1;
      if (rec.isConfirmed) {
        bucket.confirmedMinutes += mins;
      } else {
        bucket.inferredMinutes += mins;
      }
    }
  }

  const areaDistribution = Array.from(distributionMap.values()).map((d) => ({
    ...d,
    percentageOfConfirmed:
      totalConfirmedMinutes > 0
        ? Math.round((d.confirmedMinutes / totalConfirmedMinutes) * 100)
        : 0,
  }));

  const declaredRoutines = routines.filter(
    (r) => r.state === RoutineState.DECLARED
  );
  const observedRoutines = routines.filter(
    (r) => r.state === RoutineState.OBSERVED
  );
  const suggestedRoutines = routines.filter(
    (r) => r.state === RoutineState.SUGGESTED
  );

  return {
    ianaTimeZone,
    lifeAreas,
    activityRecords,
    areaDistribution,
    totalConfirmedMinutes,
    totalInferredMinutes,
    declaredRoutines,
    observedRoutines,
    suggestedRoutines,
  };
}

export async function logExplicitActivityCheckIn(
  userId: string,
  input: {
    title: string;
    lifeAreaId?: string | null;
    projectId?: string | null;
    physicalLocation?: string | null;
    durationMinutes?: number;
  }
) {
  const now = new Date();
  const duration = input.durationMinutes ?? 45;
  const startedAt = new Date(now.getTime() - duration * 60 * 1000);

  let validAreaId: string | null = null;
  let validProjId: string | null = null;

  if (input.lifeAreaId) {
    const area = await prisma.lifeArea.findFirst({
      where: { id: input.lifeAreaId, userId },
      select: { id: true },
    });
    if (area) validAreaId = area.id;
  }

  if (input.projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: input.projectId, userId },
      select: { id: true },
    });
    if (proj) validProjId = proj.id;
  }

  return prisma.activityRecord.create({
    data: {
      userId,
      lifeAreaId: validAreaId,
      projectId: validProjId,
      title: input.title.trim(),
      physicalLocation: input.physicalLocation?.trim() || null,
      startedAt,
      endedAt: now,
      durationMinutes: duration,
      source: ActivitySource.CHECKIN_RESPONSE,
      isConfirmed: true,
    },
  });
}

export async function resolveInferredActivity(
  userId: string,
  activityId: string,
  decision: "CONFIRM" | "DISMISS"
) {
  const record = await prisma.activityRecord.findFirst({
    where: { id: activityId, userId },
  });
  if (!record) throw new Error("Activity record not found");

  if (decision === "DISMISS") {
    return prisma.activityRecord.delete({
      where: { id: record.id },
    });
  }

  return prisma.activityRecord.update({
    where: { id: record.id },
    data: {
      isConfirmed: true,
      source: ActivitySource.USER_CONFIRMED,
    },
  });
}

export async function resolveSuggestedRoutine(
  userId: string,
  routineId: string,
  decision: "APPROVE" | "DISMISS"
) {
  const routine = await prisma.routine.findFirst({
    where: { id: routineId, userId },
  });
  if (!routine) throw new Error("Routine not found");

  if (decision === "DISMISS") {
    return prisma.routine.update({
      where: { id: routine.id },
      data: { isActive: false },
    });
  }

  if (routine.relatedDeclaredId) {
    const parentDeclared = await prisma.routine.findFirst({
      where: { id: routine.relatedDeclaredId, userId },
    });

    if (parentDeclared) {
      return prisma.$transaction(async (tx) => {
        const updatedParent = await tx.routine.update({
          where: { id: parentDeclared.id },
          data: {
            daysOfWeek: routine.daysOfWeek,
            startTimeLocal: routine.startTimeLocal,
            endTimeLocal: routine.endTimeLocal,
            ...(routine.physicalLocation
              ? { physicalLocation: routine.physicalLocation }
              : {}),
          },
        });

        await tx.routine.update({
          where: { id: routine.id },
          data: { isActive: false },
        });

        return updatedParent;
      });
    }
  }

  return prisma.routine.update({
    where: { id: routine.id },
    data: {
      state: RoutineState.DECLARED,
      suggestionReasoning: null,
    },
  });
}

export async function createDeclaredRoutine(
  userId: string,
  input: {
    title: string;
    lifeAreaId?: string | null;
    kind?: RoutineKind;
    daysOfWeek: number[];
    startTimeLocal: string;
    endTimeLocal: string;
    physicalLocation?: string | null;
  }
) {
  let validAreaId: string | null = null;
  if (input.lifeAreaId) {
    const area = await prisma.lifeArea.findFirst({
      where: { id: input.lifeAreaId, userId },
      select: { id: true },
    });
    if (area) validAreaId = area.id;
  }

  return prisma.routine.create({
    data: {
      userId,
      lifeAreaId: validAreaId,
      title: input.title.trim(),
      kind: input.kind ?? RoutineKind.WORK_BLOCK,
      state: RoutineState.DECLARED,
      daysOfWeek: input.daysOfWeek.length > 0 ? input.daysOfWeek : [1, 2, 3, 4, 5],
      startTimeLocal: input.startTimeLocal,
      endTimeLocal: input.endTimeLocal,
      physicalLocation: input.physicalLocation?.trim() || null,
      isActive: true,
    },
  });
}
