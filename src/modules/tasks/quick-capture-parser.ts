import { CommitmentType, TaskPriority } from "@prisma/client";
import { Temporal } from "temporal-polyfill";
import { resolveLocalDateTimeToUtc } from "@/lib/time/timezone";

export interface LifeAreaCandidate {
  id: string;
  name: string;
  slug: string;
}

export interface ParsedQuickCapture {
  title: string;
  commitmentType: CommitmentType;
  priority: TaskPriority;
  lifeAreaId: string;
  estimatedMinutes: number | null;
  flexibilityWindow: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  dueDate: Date | null;
  waitingOnPerson: string | null;
  waitingOnCondition: string | null;
  inferredSummary: string;
}

/**
 * Deterministic natural-language parser for Orbit's Quick Capture bar.
 * Ensures Orbit remains 100% functional and intelligent even when Gemini AI
 * is offline or unconfigured (Core Principle #9).
 */
export function parseQuickCaptureInput(
  rawInput: string,
  lifeAreas: LifeAreaCandidate[],
  ianaTimeZone: string,
  referenceNowUtc: Date = new Date()
): ParsedQuickCapture {
  let working = rawInput.trim();

  // Strip polite prefixes like "Remind me to ", "I need to ", "Please "
  working = working.replace(/^(?:remind me to|i need to|please|todo:?)\s+/i, "");

  // 1. Detect Life Area by #hashtag or keyword mention
  const defaultArea =
    lifeAreas.find((a) => a.slug === "personal") ?? lifeAreas[0];
  let matchedArea = defaultArea;

  for (const area of lifeAreas) {
    const tagRegex = new RegExp(`#${area.slug}\\b`, "i");
    const nameRegex = new RegExp(`\\b${area.name}\\b`, "i");
    if (tagRegex.test(working)) {
      matchedArea = area;
      working = working.replace(tagRegex, "").trim();
      break;
    }
    if (nameRegex.test(working)) {
      matchedArea = area;
    }
  }

  // Domain keyword heuristics for the user's known contexts
  if (matchedArea === defaultArea) {
    if (/\b(?:odoo|attendance|biometric)\b/i.test(working)) {
      matchedArea =
        lifeAreas.find((a) => a.slug === "basilissa") ?? matchedArea;
    } else if (/\b(?:daw|vocal|singing|mix|beat|drum|song)\b/i.test(working)) {
      matchedArea = lifeAreas.find((a) => a.slug === "music") ?? matchedArea;
    } else if (/\b(?:exam|lecture|study|class|paper)\b/i.test(working)) {
      matchedArea =
        lifeAreas.find((a) => a.slug === "education") ?? matchedArea;
    }
  }

  // 2. Detect Priority
  let priority: TaskPriority = TaskPriority.NORMAL;
  if (/\b(?:urgent|critical|asap|high priority)\b/i.test(working)) {
    priority = TaskPriority.HIGH;
    working = working.replace(/\b(?:!high|high priority)\b/gi, "").trim();
  }

  // 3. Detect Duration (e.g., "45m", "30 mins", "2h", "1.5 hours")
  let estimatedMinutes: number | null = null;
  const minMatch = working.match(/\b(\d{1,3})\s*(?:m|min|mins|minutes)\b/i);
  const hourMatch = working.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours)\b/i);
  if (minMatch?.[1]) {
    estimatedMinutes = parseInt(minMatch[1], 10);
    working = working.replace(minMatch[0], "").trim();
  } else if (hourMatch?.[1]) {
    estimatedMinutes = Math.round(parseFloat(hourMatch[1]) * 60);
    working = working.replace(hourMatch[0], "").trim();
  }

  // 4. Detect WAITING state ("Waiting on <person> for <condition>")
  let commitmentType: CommitmentType = CommitmentType.FLEXIBLE;
  let waitingOnPerson: string | null = null;
  let waitingOnCondition: string | null = null;

  const waitingMatch = working.match(
    /^waiting\s+(?:on|for)\s+([^,.]+?)(?:\s+(?:to|for|about)\s+(.+))?$/i
  );
  if (waitingMatch?.[1]) {
    commitmentType = CommitmentType.WAITING;
    waitingOnPerson = waitingMatch[1].trim();
    waitingOnCondition = waitingMatch[2]?.trim() ?? null;
  }

  // 5. Detect Time / Date Intent using Temporal in user's IANA time zone
  const nowInstant = Temporal.Instant.fromEpochMilliseconds(
    referenceNowUtc.getTime()
  );
  const nowZoned = nowInstant.toZonedDateTimeISO(ianaTimeZone);
  const todayPlain = nowZoned.toPlainDate();

  let targetDatePlain: Temporal.PlainDate | null = null;
  let targetTimePlain: Temporal.PlainTime | null = null;
  let flexibilityWindow: string | null = null;

  if (/\btomorrow\b/i.test(working)) {
    targetDatePlain = todayPlain.add({ days: 1 });
  } else if (/\btoday\b|\btonight\b/i.test(working)) {
    targetDatePlain = todayPlain;
  } else if (/\bthis weekend\b|\bweekend\b/i.test(working)) {
    flexibilityWindow = "WEEKEND";
  } else if (/\bthis week\b/i.test(working)) {
    flexibilityWindow = "THIS_WEEK";
  }

  // Explicit clock time e.g. "at 2pm", "at 14:30", "at 9:00 am"
  const explicitTimeMatch = working.match(
    /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
  );
  if (explicitTimeMatch?.[1]) {
    let hour = parseInt(explicitTimeMatch[1], 10);
    const minute = explicitTimeMatch[2]
      ? parseInt(explicitTimeMatch[2], 10)
      : 0;
    const meridiem = explicitTimeMatch[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      targetTimePlain = new Temporal.PlainTime(hour, minute);
      if (!targetDatePlain) {
        targetDatePlain = todayPlain;
      }
    }
  } else if (/\bmorning\b/i.test(working)) {
    if (targetDatePlain && !targetDatePlain.equals(todayPlain)) {
      targetTimePlain = new Temporal.PlainTime(9, 30);
    } else {
      flexibilityWindow = "THIS_MORNING";
    }
  } else if (/\bafternoon\b/i.test(working)) {
    if (targetDatePlain && !targetDatePlain.equals(todayPlain)) {
      targetTimePlain = new Temporal.PlainTime(14, 0);
    } else {
      flexibilityWindow = "THIS_AFTERNOON";
    }
  } else if (/\bevening\b|\btonight\b/i.test(working)) {
    if (targetDatePlain && !targetDatePlain.equals(todayPlain)) {
      targetTimePlain = new Temporal.PlainTime(19, 30);
    } else {
      flexibilityWindow = "THIS_EVENING";
    }
  }

  let scheduledStart: Date | null = null;
  let scheduledEnd: Date | null = null;
  const dueDate: Date | null = null;

  if (
    commitmentType !== CommitmentType.WAITING &&
    targetDatePlain &&
    targetTimePlain
  ) {
    commitmentType = CommitmentType.SCHEDULED;
    const hh = String(targetTimePlain.hour).padStart(2, "0");
    const mm = String(targetTimePlain.minute).padStart(2, "0");
    const resolved = resolveLocalDateTimeToUtc(
      targetDatePlain.toString(),
      `${hh}:${mm}`,
      ianaTimeZone
    );
    scheduledStart = resolved.instantUtc;
    const durationMin = estimatedMinutes ?? 60;
    scheduledEnd = new Date(
      scheduledStart.getTime() + durationMin * 60 * 1000
    );
  }

  // Clean trailing temporal phrases from title if title stays meaningful
  const cleanedTitle = working
    .replace(
      /\s+\b(?:tomorrow|today|tonight)\s+(?:morning|afternoon|evening)\b/gi,
      ""
    )
    .replace(/\s+\bthis\s+(?:morning|afternoon|evening|week|weekend)\b/gi, "")
    .replace(/\s+\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const finalTitle =
    cleanedTitle.length >= 3
      ? cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1)
      : working.charAt(0).toUpperCase() + working.slice(1);

  const areaLabel = matchedArea?.name ?? "Personal";
  const summaryParts = [areaLabel, commitmentType];
  if (flexibilityWindow) summaryParts.push(flexibilityWindow);
  if (estimatedMinutes) summaryParts.push(`${estimatedMinutes}m`);

  return {
    title: finalTitle,
    commitmentType,
    priority,
    lifeAreaId: matchedArea?.id ?? "",
    estimatedMinutes,
    flexibilityWindow,
    scheduledStart,
    scheduledEnd,
    dueDate,
    waitingOnPerson,
    waitingOnCondition,
    inferredSummary: summaryParts.join(" · "),
  };
}
