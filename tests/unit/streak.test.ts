import { describe, expect, test } from "bun:test";
import { calculateStreak, streakLabel } from "../../src/services/streak.ts";
import type { CheckinStatus } from "../../src/types.ts";

describe("calculateStreak", () => {
  test("counts consecutive sober days before asOfDate", () => {
    const history = [
      { date: "2026-05-25", status: "sober" as CheckinStatus },
      { date: "2026-05-24", status: "sober" as CheckinStatus },
      { date: "2026-05-23", status: "slip" as CheckinStatus },
    ];
    expect(calculateStreak(history, "2026-05-26")).toBe(2);
  });

  test("skip does not break streak", () => {
    const history = [
      { date: "2026-05-25", status: "sober" as CheckinStatus },
      { date: "2026-05-24", status: "skipped" as CheckinStatus },
      { date: "2026-05-23", status: "sober" as CheckinStatus },
    ];
    expect(calculateStreak(history, "2026-05-26")).toBe(2);
  });

  test("streak resets after slip", () => {
    const history = [{ date: "2026-05-25", status: "slip" as CheckinStatus }];
    expect(calculateStreak(history, "2026-05-26")).toBe(0);
  });
});

describe("streakLabel", () => {
  test("formats labels", () => {
    expect(streakLabel(0)).toBe("streak reset");
    expect(streakLabel(1)).toBe("1 day streak");
    expect(streakLabel(12)).toBe("12 day streak");
  });
});
