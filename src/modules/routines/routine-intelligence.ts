import { RoutineKind, RoutineState } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getLocalWallClockInfo } from "@/lib/time/timezone";

export interface DeclaredRoutineSnapshot {
  id: string;
  title: string;
  lifeAreaId: string | null;
  kind: RoutineKind;
  daysOfWeek: number[];
  startTimeLocal: string;
  endTimeLocal: string;
  physicalLocation: string | null;
}

export interface ConfirmedActivitySnapshot {
  id: string;
  title: string;
  lifeAreaId: string | null;
  startedAt: Date;
  durationMinutes: number | null;
  isConfirmed: boolean;
}

export interface LifeAreaLookupItem {
  id: string;
  name: string;
}

export interface SuggestedRoutineCandidate {
  title: string;
  lifeAreaId: string | null;
  kind: RoutineKind;
  daysOfWeek: number[];
  startTimeLocal: string;
  endTimeLocal: string;
  physicalLocation: string | null;
  confidenceScore: number;
  suggestionReasoning: string;
  relatedDeclaredId: string | null;
}

function hhmmToMinutes(hhmm: string): number {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Number(hRaw ?? 0);
  const m = Number(mRaw ?? 0);
  return h * 60 + m;
}

function minutesToRoundedHHmm(totalMinutes: number): string {
  const clamped = ((Math.round(totalMinutes / 15) * 15) % 1440 + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const ISO_DAY_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/**
 * Pure, deterministic analyzer that inspects confirmed ActivityRecord entries
 * against DECLARED routines in the user's IANA time zone.
 * Unconfirmed / AI-inferred records are strictly ignored (Core Principle #6).
 */
export function detectRoutineSuggestions(input: {
  declaredRoutines: DeclaredRoutineSnapshot[];
  activities: ConfirmedActivitySnapshot[];
  lifeAreas: LifeAreaLookupItem[];
  ianaTimeZone: string;
}): SuggestedRoutineCandidate[] {
  const confirmed = input.activities.filter((a) => a.isConfirmed);
  if (confirmed.length < 2) return [];

  const areaNameById = new Map(input.lifeAreas.map((a) => [a.id, a.name]));

  const projected = confirmed.map((act) => {
    const wall = getLocalWallClockInfo(act.startedAt, input.ianaTimeZone);
    return {
      ...act,
      localDate: wall.localDate,
      localTimeHHmm: wall.localTimeHHmm,
      startMinutes: hhmmToMinutes(wall.localTimeHHmm),
      isoDayOfWeek: wall.isoDayOfWeek,
      durationMinutes: act.durationMinutes ?? 60,
    };
  });

  const candidates: SuggestedRoutineCandidate[] = [];
  const matchedActivityIds = new Set<string>();

  // 1. Detect consistent start-time shift on existing DECLARED routines
  for (const routine of input.declaredRoutines) {
    if (!routine.lifeAreaId) continue;

    const declaredStartMin = hhmmToMinutes(routine.startTimeLocal);
    const declaredEndMin = hhmmToMinutes(routine.endTimeLocal);
    const declaredDuration = Math.max(
      30,
      declaredEndMin >= declaredStartMin
        ? declaredEndMin - declaredStartMin
        : declaredEndMin + 1440 - declaredStartMin
    );

    const relevant = projected.filter((act) => {
      if (act.lifeAreaId !== routine.lifeAreaId) return false;
      const diff = act.startMinutes - declaredStartMin;
      return Math.abs(diff) >= 45 && Math.abs(diff) <= 240;
    });

    const distinctDates = new Set(relevant.map((r) => r.localDate));
    if (relevant.length >= 2 && distinctDates.size >= 2) {
      const sortedStarts = relevant
        .map((r) => r.startMinutes)
        .sort((a, b) => a - b);
      const spread =
        (sortedStarts[sortedStarts.length - 1] ?? 0) - (sortedStarts[0] ?? 0);

      if (spread <= 75) {
        const avgStart =
          sortedStarts.reduce((sum, n) => sum + n, 0) / sortedStarts.length;
        const proposedStart = minutesToRoundedHHmm(avgStart);
        const proposedEnd = minutesToRoundedHHmm(avgStart + declaredDuration);

        if (proposedStart !== routine.startTimeLocal) {
          for (const r of relevant) matchedActivityIds.add(r.id);
          const areaLabel =
            areaNameById.get(routine.lifeAreaId) ?? routine.title;

          candidates.push({
            title: routine.title,
            lifeAreaId: routine.lifeAreaId,
            kind: routine.kind,
            daysOfWeek: routine.daysOfWeek,
            startTimeLocal: proposedStart,
            endTimeLocal: proposedEnd,
            physicalLocation: routine.physicalLocation,
            confidenceScore: Math.min(0.92, 0.65 + relevant.length * 0.08),
            suggestionReasoning: `Your last ${relevant.length} confirmed ${areaLabel} sessions started around ${proposedStart} instead of ${routine.startTimeLocal}.`,
            relatedDeclaredId: routine.id,
          });
        }
      }
    }
  }

  // 2. Detect uncaptured recurring work blocks (3+ confirmed sessions on distinct days)
  const buckets = new Map<string, typeof projected>();
  for (const act of projected) {
    if (!act.lifeAreaId || matchedActivityIds.has(act.id)) continue;
    const period =
      act.startMinutes < 720
        ? "MORNING"
        : act.startMinutes < 1020
          ? "AFTERNOON"
          : "EVENING";
    const key = `${act.lifeAreaId}:${period}`;
    const arr = buckets.get(key) ?? [];
    arr.push(act);
    buckets.set(key, arr);
  }

  for (const [bucketKey, items] of buckets.entries()) {
    const distinctDates = new Set(items.map((i) => i.localDate));
    if (items.length < 3 || distinctDates.size < 3) continue;

    const [lifeAreaId, period] = bucketKey.split(":");
    if (!lifeAreaId) continue;

    const avgStart =
      items.reduce((sum, i) => sum + i.startMinutes, 0) / items.length;
    const avgDuration = Math.max(
      30,
      Math.round(
        items.reduce((sum, i) => sum + i.durationMinutes, 0) / items.length
      )
    );

    // Skip if a declared routine already covers this area near this start time
    const alreadyCovered = input.declaredRoutines.some(
      (r) =>
        r.lifeAreaId === lifeAreaId &&
        Math.abs(hhmmToMinutes(r.startTimeLocal) - avgStart) < 120
    );
    if (alreadyCovered) continue;

    const days = Array.from(new Set(items.map((i) => i.isoDayOfWeek))).sort(
      (a, b) => a - b
    );
    const startTimeLocal = minutesToRoundedHHmm(avgStart);
    const endTimeLocal = minutesToRoundedHHmm(avgStart + avgDuration);
    const areaName = areaNameById.get(lifeAreaId) ?? "Focus";
    const periodWord =
      period === "MORNING"
        ? "morning"
        : period === "AFTERNOON"
          ? "afternoon"
          : "evening";
    const daysText = days.map((d) => ISO_DAY_NAMES[d] ?? String(d)).join(", ");

    candidates.push({
      title: `${areaName} ${periodWord} block`,
      lifeAreaId,
      kind: RoutineKind.WORK_BLOCK,
      daysOfWeek: days,
      startTimeLocal,
      endTimeLocal,
      physicalLocation: null,
      confidenceScore: Math.min(0.9, 0.6 + items.length * 0.07),
      suggestionReasoning: `You logged ${items.length} confirmed ${areaName} sessions around ${startTimeLocal} (${daysText}).`,
      relatedDeclaredId: null,
    });
  }

  return candidates;
}

/**
 * Evaluates confirmed activity history for `userId` and upserts any non-duplicate
 * SUGGESTED routines for calm review on `/routines`.
 */
export async function evaluateUserRoutineIntelligence(userId: string) {
  const sinceUtc = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

  const [pref, lifeAreas, routines, activities] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.lifeArea.findMany({
      where: { userId, isArchived: false },
      select: { id: true, name: true },
    }),
    prisma.routine.findMany({
      where: { userId },
    }),
    prisma.activityRecord.findMany({
      where: {
        userId,
        isConfirmed: true,
        startedAt: { gte: sinceUtc },
      },
      orderBy: { startedAt: "desc" },
      take: 120,
    }),
  ]);

  const ianaTimeZone = pref?.ianaTimeZone ?? "Africa/Lagos";
  const declaredRoutines = routines.filter(
    (r) => r.isActive && r.state === RoutineState.DECLARED
  );

  const candidates = detectRoutineSuggestions({
    declaredRoutines,
    activities,
    lifeAreas,
    ianaTimeZone,
  });

  let createdCount = 0;
  for (const candidate of candidates) {
    // Do not recreate a suggestion the user already dismissed or already has queued
    const duplicate = routines.some(
      (existing) =>
        existing.state === RoutineState.SUGGESTED &&
        ((candidate.relatedDeclaredId &&
          existing.relatedDeclaredId === candidate.relatedDeclaredId &&
          existing.startTimeLocal === candidate.startTimeLocal) ||
          (!candidate.relatedDeclaredId &&
            existing.lifeAreaId === candidate.lifeAreaId &&
            existing.title === candidate.title))
    );

    if (duplicate) continue;

    await prisma.routine.create({
      data: {
        userId,
        lifeAreaId: candidate.lifeAreaId,
        title: candidate.title,
        kind: candidate.kind,
        state: RoutineState.SUGGESTED,
        daysOfWeek: candidate.daysOfWeek,
        startTimeLocal: candidate.startTimeLocal,
        endTimeLocal: candidate.endTimeLocal,
        physicalLocation: candidate.physicalLocation,
        confidenceScore: candidate.confidenceScore,
        suggestionReasoning: candidate.suggestionReasoning,
        relatedDeclaredId: candidate.relatedDeclaredId,
        isActive: true,
      },
    });
    createdCount += 1;
  }

  return { evaluatedActivities: activities.length, createdCount };
}
