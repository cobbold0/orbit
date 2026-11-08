import { describe, expect, it } from "vitest";
import { RoutineKind } from "@prisma/client";
import { detectRoutineSuggestions } from "./routine-intelligence";

describe("Routine Intelligence pattern detector", () => {
  it("proposes a start-time shift when confirmed sessions consistently start later than declared", () => {
    const suggestions = detectRoutineSuggestions({
      ianaTimeZone: "UTC",
      lifeAreas: [{ id: "area_music", name: "Music" }],
      declaredRoutines: [
        {
          id: "rtn_music",
          title: "Vocal & DAW practice",
          lifeAreaId: "area_music",
          kind: RoutineKind.HABIT,
          daysOfWeek: [2, 4],
          startTimeLocal: "19:00",
          endTimeLocal: "20:30",
          physicalLocation: "Home Studio",
        },
      ],
      activities: [
        {
          id: "act_1",
          title: "Vocal takes",
          lifeAreaId: "area_music",
          startedAt: new Date("2026-11-03T20:30:00Z"),
          durationMinutes: 90,
          isConfirmed: true,
        },
        {
          id: "act_2",
          title: "Drum arrangement",
          lifeAreaId: "area_music",
          startedAt: new Date("2026-11-05T20:25:00Z"),
          durationMinutes: 80,
          isConfirmed: true,
        },
        {
          // Unconfirmed AI inference must be ignored!
          id: "act_unconfirmed",
          title: "Inferred session",
          lifeAreaId: "area_music",
          startedAt: new Date("2026-11-06T08:00:00Z"),
          durationMinutes: 60,
          isConfirmed: false,
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.relatedDeclaredId).toBe("rtn_music");
    expect(suggestions[0]?.startTimeLocal).toBe("20:30");
    expect(suggestions[0]?.suggestionReasoning).toContain("20:30");
  });

  it("ignores unconfirmed activities and proposes a new block when 3+ confirmed sessions cluster", () => {
    const suggestions = detectRoutineSuggestions({
      ianaTimeZone: "UTC",
      lifeAreas: [{ id: "area_edu", name: "Education" }],
      declaredRoutines: [],
      activities: [
        {
          id: "e1",
          title: "Distributed systems notes",
          lifeAreaId: "area_edu",
          startedAt: new Date("2026-11-01T08:05:00Z"),
          durationMinutes: 60,
          isConfirmed: true,
        },
        {
          id: "e2",
          title: "Problem set review",
          lifeAreaId: "area_edu",
          startedAt: new Date("2026-11-03T07:55:00Z"),
          durationMinutes: 60,
          isConfirmed: true,
        },
        {
          id: "e3",
          title: "Lecture reading",
          lifeAreaId: "area_edu",
          startedAt: new Date("2026-11-05T08:00:00Z"),
          durationMinutes: 60,
          isConfirmed: true,
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.relatedDeclaredId).toBeNull();
    expect(suggestions[0]?.startTimeLocal).toBe("08:00");
    expect(suggestions[0]?.title).toBe("Education morning block");
  });
});
