import { Temporal } from "temporal-polyfill";

const LOCALE = "en-GB";

/** "Sunday 8 November" from a local calendar date (YYYY-MM-DD). */
export function formatLongDate(localDate: string): string {
  return Temporal.PlainDate.from(localDate).toLocaleString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "Wed 11 Nov" for a UTC instant, viewed in the user's time zone. */
export function formatShortDate(date: Date, ianaTimeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(ianaTimeZone)
    .toPlainDate()
    .toLocaleString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
}

/** "14:30" for a UTC instant, viewed in the user's time zone (24 hour). */
export function formatClock(date: Date, ianaTimeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(ianaTimeZone)
    .toLocaleString(LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
}

/** "10:00 to 11:00" */
export function formatClockRange(
  start: Date,
  end: Date,
  ianaTimeZone: string
): string {
  return `${formatClock(start, ianaTimeZone)} to ${formatClock(end, ianaTimeZone)}`;
}

/** "45 min", "2 h", "1 h 30 min" */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** [1, 2] becomes "Mon, Tue" */
export function formatDays(isoDays: number[]): string {
  return isoDays.map((d) => DAY_SHORT[d - 1] ?? "").join(", ");
}

export const CLASSIFICATION_LABEL: Record<string, string> = {
  AGREED_TO_DO: "Agreed",
  ASSIGNED_TO_USER: "Assigned to you",
  FOLLOW_UP: "Follow up",
  DEADLINE_MENTION: "Deadline",
  IDEA_PROPOSED: "Idea",
  MENTIONED_ONLY: "Mentioned",
  ALREADY_COMPLETED: "Already done",
};

export const CAPTURE_KIND_LABEL: Record<string, string> = {
  TEXT_NOTE: "Note",
  MEETING_NOTES: "Meeting",
  VOICE_NOTE: "Voice",
  PASTED_MESSAGE: "Message",
  QUICK_THOUGHT: "Idea",
};

/** Removes markdown emphasis markers and em-dashes so replies read as clean plain text. */
export function toPlainText(input: string): string {
  return input
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$|[.,!?])/g, "$1$2")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/\s*--\s*/g, ", ");
}
