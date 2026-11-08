import { Temporal } from "temporal-polyfill";

export interface DSTResolutionResult {
  instantUtc: Date;
  zonedIso: string;
  hadDstConflict: boolean;
}

/**
 * Resolves a local calendar date ("YYYY-MM-DD") and wall-clock time ("HH:mm")
 * inside a specific IANA time zone into a UTC Date (Instant), detecting
 * Daylight Saving Time (DST) gaps or overlaps without crashing.
 */
export function resolveLocalDateTimeToUtc(
  localDateStr: string,
  localTimeStr: string,
  ianaTimeZone: string
): DSTResolutionResult {
  const plainDate = Temporal.PlainDate.from(localDateStr);
  const plainTime = Temporal.PlainTime.from(localTimeStr);
  const plainDateTime = plainDate.toPlainDateTime(plainTime);
  const zonedInputStr = `${plainDateTime.toString()}[${ianaTimeZone}]`;

  let hadDstConflict = false;
  try {
    Temporal.ZonedDateTime.from(zonedInputStr, { disambiguation: "reject" });
  } catch (err) {
    if (err instanceof RangeError) {
      hadDstConflict = true;
    } else {
      throw err;
    }
  }

  const resolvedZoned = Temporal.ZonedDateTime.from(zonedInputStr, {
    disambiguation: "compatible",
  });
  const instant = resolvedZoned.toInstant();

  return {
    instantUtc: new Date(instant.epochMilliseconds),
    zonedIso: resolvedZoned.toString(),
    hadDstConflict,
  };
}

/**
 * Computes the UTC start and end bounds of a local calendar day ("YYYY-MM-DD")
 * in the user's IANA time zone.
 */
export function getLocalDayBoundsUtc(
  localDateStr: string,
  ianaTimeZone: string
): { startUtc: Date; endUtc: Date; localDate: string } {
  const plainDate = Temporal.PlainDate.from(localDateStr);
  const startZoned = plainDate.toZonedDateTime({
    timeZone: ianaTimeZone,
    plainTime: Temporal.PlainTime.from("00:00:00"),
  });
  const nextDayZoned = plainDate
    .add({ days: 1 })
    .toZonedDateTime({
      timeZone: ianaTimeZone,
      plainTime: Temporal.PlainTime.from("00:00:00"),
    });

  return {
    startUtc: new Date(startZoned.toInstant().epochMilliseconds),
    endUtc: new Date(nextDayZoned.toInstant().epochMilliseconds),
    localDate: plainDate.toString(),
  };
}

/**
 * Formats a UTC Date in the user's IANA time zone using native locale formatting.
 */
export function formatTimeInZone(
  utcDate: Date,
  ianaTimeZone: string,
  locale = "en-GB"
): string {
  const instant = Temporal.Instant.fromEpochMilliseconds(utcDate.getTime());
  const zoned = instant.toZonedDateTimeISO(ianaTimeZone);
  return zoned.toLocaleString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/**
 * Extracts the local ISO day of week (1 = Monday ... 7 = Sunday) and local
 * wall-clock time ("HH:mm") for a given UTC Date in the user's IANA time zone.
 */
export function getLocalWallClockInfo(
  utcDate: Date,
  ianaTimeZone: string
): {
  localDate: string;
  localTimeHHmm: string;
  isoDayOfWeek: number;
} {
  const instant = Temporal.Instant.fromEpochMilliseconds(utcDate.getTime());
  const zoned = instant.toZonedDateTimeISO(ianaTimeZone);
  const plainDate = zoned.toPlainDate();
  const plainTime = zoned.toPlainTime();

  const hh = String(plainTime.hour).padStart(2, "0");
  const mm = String(plainTime.minute).padStart(2, "0");

  return {
    localDate: plainDate.toString(),
    localTimeHHmm: `${hh}:${mm}`,
    isoDayOfWeek: plainDate.dayOfWeek,
  };
}

/**
 * Determines whether a given UTC timestamp falls inside the user's configured
 * quiet hours (e.g., quietHoursStart = "22:00", quietHoursEnd = "07:00")
 * in their local IANA time zone. Supports overnight spans across midnight.
 */
export function isWithinQuietHours(
  utcDate: Date,
  ianaTimeZone: string,
  quietHoursStart: string,
  quietHoursEnd: string
): boolean {
  const instant = Temporal.Instant.fromEpochMilliseconds(utcDate.getTime());
  const zoned = instant.toZonedDateTimeISO(ianaTimeZone);
  const currentTime = zoned.toPlainTime();
  const start = Temporal.PlainTime.from(quietHoursStart);
  const end = Temporal.PlainTime.from(quietHoursEnd);

  const crossesMidnight = Temporal.PlainTime.compare(start, end) > 0;
  if (crossesMidnight) {
    // e.g. 22:00 -> 07:00: active if current >= 22:00 OR current < 07:00
    return (
      Temporal.PlainTime.compare(currentTime, start) >= 0 ||
      Temporal.PlainTime.compare(currentTime, end) < 0
    );
  }

  // Same-day window, e.g. 01:00 -> 06:00
  return (
    Temporal.PlainTime.compare(currentTime, start) >= 0 &&
    Temporal.PlainTime.compare(currentTime, end) < 0
  );
}
