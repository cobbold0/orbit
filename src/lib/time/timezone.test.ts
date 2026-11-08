import { describe, expect, it } from "vitest";
import {
  getLocalDayBoundsUtc,
  getLocalWallClockInfo,
  isWithinQuietHours,
  resolveLocalDateTimeToUtc,
} from "./timezone";

describe("Timezone & DST Scheduling Utilities", () => {
  it("resolves normal local dates and times accurately in a given IANA zone", () => {
    const res = resolveLocalDateTimeToUtc(
      "2026-11-09",
      "14:00",
      "Africa/Lagos" // UTC+1 year-round
    );

    expect(res.hadDstConflict).toBe(false);
    expect(res.instantUtc.toISOString()).toBe("2026-11-09T13:00:00.000Z");
  });

  it("detects and safely resolves DST Spring-Forward skipped hour without crashing", () => {
    // In America/New_York on 2026-03-08, clocks jump from 02:00 to 03:00
    const res = resolveLocalDateTimeToUtc(
      "2026-03-08",
      "02:30",
      "America/New_York"
    );

    expect(res.hadDstConflict).toBe(true);
    expect(res.instantUtc).toBeInstanceOf(Date);
    expect(Number.isNaN(res.instantUtc.getTime())).toBe(false);
  });

  it("computes local day bounds accurately across timezones", () => {
    const bounds = getLocalDayBoundsUtc("2026-11-09", "Africa/Lagos");
    expect(bounds.startUtc.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(bounds.endUtc.toISOString()).toBe("2026-11-09T23:00:00.000Z");
  });

  it("evaluates overnight quiet hours (22:00 -> 07:00) accurately", () => {
    // 23:15 in Africa/Lagos (22:15 UTC) -> inside quiet hours
    const lateEveningUtc = new Date("2026-11-09T22:15:00.000Z");
    expect(
      isWithinQuietHours(lateEveningUtc, "Africa/Lagos", "22:00", "07:00")
    ).toBe(true);

    // 06:30 in Africa/Lagos (05:30 UTC) -> inside quiet hours
    const earlyMorningUtc = new Date("2026-11-09T05:30:00.000Z");
    expect(
      isWithinQuietHours(earlyMorningUtc, "Africa/Lagos", "22:00", "07:00")
    ).toBe(true);

    // 09:00 in Africa/Lagos (08:00 UTC) -> outside quiet hours
    const workMorningUtc = new Date("2026-11-09T08:00:00.000Z");
    expect(
      isWithinQuietHours(workMorningUtc, "Africa/Lagos", "22:00", "07:00")
    ).toBe(false);
  });

  it("extracts ISO day of week and local wall-clock time", () => {
    // Wednesday 2026-11-11 at 08:30 UTC -> 09:30 in Africa/Lagos (ISO day 3 = Wednesday)
    const info = getLocalWallClockInfo(
      new Date("2026-11-11T08:30:00.000Z"),
      "Africa/Lagos"
    );
    expect(info.localDate).toBe("2026-11-11");
    expect(info.localTimeHHmm).toBe("09:30");
    expect(info.isoDayOfWeek).toBe(3);
  });
});
