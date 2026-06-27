import { describe, expect, test } from "bun:test";
import {
  buildCheckinPattern,
  computeStreakQuality,
  isSolidMilestone,
} from "../../src/services/streak-quality.ts";

describe("buildCheckinPattern", () => {
  test("encodes sober and minor days", () => {
    const pattern = buildCheckinPattern(
      [
        { date: "2026-06-01", status: "sober" },
        { date: "2026-06-02", status: "minor_slip" },
      ],
      "2026-06-02",
      2,
    );
    expect(pattern).toBe("Km");
  });
});

describe("computeStreakQuality", () => {
  test("alternating pattern is grace-heavy", () => {
    const history = [
      { date: "2026-06-01", status: "sober" as const },
      { date: "2026-06-02", status: "minor_slip" as const },
      { date: "2026-06-03", status: "sober" as const },
      { date: "2026-06-04", status: "minor_slip" as const },
    ];
    const q = computeStreakQuality(history, "2026-06-04");
    expect(q.quality).toBe("grace-heavy");
    expect(q.pattern.endsWith("KmKm")).toBe(true);
  });

  test("solid streak has no grace days", () => {
    const history = [
      { date: "2026-06-01", status: "sober" as const },
      { date: "2026-06-02", status: "sober" as const },
      { date: "2026-06-03", status: "sober" as const },
    ];
    const q = computeStreakQuality(history, "2026-06-03");
    expect(q.quality).toBe("solid");
    expect(q.graceDaysInWindow).toBe(0);
  });
});

describe("isSolidMilestone", () => {
  test("7 days solid counts as milestone", () => {
    expect(isSolidMilestone(7, "solid")).toBe(true);
  });

  test("7 days grace-heavy is not solid milestone", () => {
    expect(isSolidMilestone(7, "grace-heavy")).toBe(false);
  });
});
