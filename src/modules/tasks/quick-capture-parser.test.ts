import { describe, expect, it } from "vitest";
import { CommitmentType } from "@prisma/client";
import { parseQuickCaptureInput } from "./quick-capture-parser";

const mockAreas = [
  { id: "area_basilissa", name: "Basilissa", slug: "basilissa" },
  { id: "area_everlyx", name: "Everlyx", slug: "everlyx" },
  { id: "area_music", name: "Music", slug: "music" },
  { id: "area_personal", name: "Personal", slug: "personal" },
];

describe("Deterministic Quick Capture Parser", () => {
  const refUtc = new Date("2026-11-08T10:00:00.000Z"); // 11:00 in Africa/Lagos

  it("parses 'Remind me to call the Odoo developer tomorrow afternoon' into a scheduled Basilissa commitment", () => {
    const parsed = parseQuickCaptureInput(
      "Remind me to call the Odoo developer tomorrow afternoon",
      mockAreas,
      "Africa/Lagos",
      refUtc
    );

    expect(parsed.title).toBe("Call the Odoo developer");
    expect(parsed.lifeAreaId).toBe("area_basilissa");
    expect(parsed.commitmentType).toBe(CommitmentType.SCHEDULED);
    // Tomorrow (2026-11-09) at 14:00 Africa/Lagos = 13:00 UTC
    expect(parsed.scheduledStart?.toISOString()).toBe(
      "2026-11-09T13:00:00.000Z"
    );
  });

  it("parses flexible tasks with duration and evening window without forcing calendar slots", () => {
    const parsed = parseQuickCaptureInput(
      "Practice vocal recording this evening 45m #music",
      mockAreas,
      "Africa/Lagos",
      refUtc
    );

    expect(parsed.title).toBe("Practice vocal recording");
    expect(parsed.lifeAreaId).toBe("area_music");
    expect(parsed.commitmentType).toBe(CommitmentType.FLEXIBLE);
    expect(parsed.estimatedMinutes).toBe(45);
    expect(parsed.flexibilityWindow).toBe("THIS_EVENING");
    expect(parsed.scheduledStart).toBeNull();
  });

  it("parses 'Waiting on ...' into a WAITING task", () => {
    const parsed = parseQuickCaptureInput(
      "Waiting on Odoo developer for attendance API credentials",
      mockAreas,
      "Africa/Lagos",
      refUtc
    );

    expect(parsed.commitmentType).toBe(CommitmentType.WAITING);
    expect(parsed.waitingOnPerson).toBe("Odoo developer");
    expect(parsed.waitingOnCondition).toBe("attendance API credentials");
    expect(parsed.lifeAreaId).toBe("area_basilissa");
  });
});
