import { describe, expect, test } from "bun:test";
import {
  buildMemberStats,
  calculateIntoxStreak,
  calculateMaxStreaks,
  calculateSoberStreak,
  calculateStreak,
  detectTodayEvent,
  streakLabel,
} from "../../src/services/streak.ts";
import type { CheckinStatus } from "../../src/types.ts";

function days(entries: Array<[string, CheckinStatus]>) {
  return entries.map(([date, status]) => ({ date, status }));
}

describe("calculateSoberStreak", () => {
  test("counts consecutive sober days including asOfDate", () => {
    const history = days([
      ["2026-05-26", "sober"],
      ["2026-05-25", "sober"],
      ["2026-05-24", "sober"],
      ["2026-05-23", "major_slip"],
    ]);
    expect(calculateSoberStreak(history, "2026-05-26")).toBe(3);
  });

  test("single minor slip does not break sober streak", () => {
    const history = days([
      ["2026-05-26", "sober"],
      ["2026-05-25", "minor_slip"],
      ["2026-05-24", "sober"],
      ["2026-05-23", "sober"],
    ]);
    expect(calculateSoberStreak(history, "2026-05-26")).toBe(3);
  });

  test("10 sober + 1 minor keeps streak at 10", () => {
    const history: { date: string; status: CheckinStatus }[] = [];
    for (let i = 0; i < 10; i++) {
      const d = 25 - i;
      history.push({ date: `2026-05-${String(d).padStart(2, "0")}`, status: "sober" });
    }
    history.push({ date: "2026-05-26", status: "minor_slip" });
    expect(calculateSoberStreak(history, "2026-05-26")).toBe(10);
  });

  test("two consecutive minors break sober streak", () => {
    const history = days([
      ["2026-05-26", "minor_slip"],
      ["2026-05-25", "minor_slip"],
      ["2026-05-24", "sober"],
      ["2026-05-23", "sober"],
    ]);
    expect(calculateSoberStreak(history, "2026-05-26")).toBe(0);
  });

  test("major slip breaks sober streak immediately", () => {
    const history = days([
      ["2026-05-26", "major_slip"],
      ["2026-05-25", "sober"],
      ["2026-05-24", "sober"],
    ]);
    expect(calculateSoberStreak(history, "2026-05-26")).toBe(0);
  });
});

describe("calculateIntoxStreak", () => {
  test("counts consecutive slip days", () => {
    const history = days([
      ["2026-05-26", "minor_slip"],
      ["2026-05-25", "minor_slip"],
      ["2026-05-24", "sober"],
    ]);
    expect(calculateIntoxStreak(history, "2026-05-26")).toBe(2);
  });

  test("major alone gives intox streak 1", () => {
    const history = days([["2026-05-26", "major_slip"]]);
    expect(calculateIntoxStreak(history, "2026-05-26")).toBe(1);
  });

  test("sober day breaks intox streak", () => {
    const history = days([
      ["2026-05-26", "sober"],
      ["2026-05-25", "minor_slip"],
    ]);
    expect(calculateIntoxStreak(history, "2026-05-26")).toBe(0);
  });
});

describe("buildMemberStats", () => {
  test("10 sober + minor + minor gives sober 0 intox 2", () => {
    const history: { date: string; status: CheckinStatus }[] = [];
    for (let i = 0; i < 10; i++) {
      history.push({
        date: `2026-05-${String(15 + i).padStart(2, "0")}`,
        status: "sober",
      });
    }
    history.push({ date: "2026-05-25", status: "minor_slip" });
    history.push({ date: "2026-05-26", status: "minor_slip" });

    const stats = buildMemberStats(history, "2026-05-26");
    expect(stats.soberCurrent).toBe(0);
    expect(stats.intoxCurrent).toBe(2);
  });
});

describe("calculateMaxStreaks", () => {
  test("tracks historical maxima", () => {
    const history = days([
      ["2026-05-01", "sober"],
      ["2026-05-02", "sober"],
      ["2026-05-03", "sober"],
      ["2026-05-04", "major_slip"],
      ["2026-05-05", "minor_slip"],
      ["2026-05-06", "minor_slip"],
    ]);
    const { soberMax, intoxMax } = calculateMaxStreaks(history);
    expect(soberMax).toBe(3);
    expect(intoxMax).toBe(3);
  });
});

describe("detectTodayEvent", () => {
  test("grace minor after sober streak", () => {
    const history = days([
      ["2026-05-24", "sober"],
      ["2026-05-25", "sober"],
    ]);
    expect(detectTodayEvent("minor_slip", history, "2026-05-26")).toBe("grace_minor");
  });

  test("milestone 7 on sober day", () => {
    const history: { date: string; status: CheckinStatus }[] = [];
    for (let i = 1; i <= 6; i++) {
      history.push({ date: `2026-05-${String(i).padStart(2, "0")}`, status: "sober" });
    }
    expect(detectTodayEvent("sober", history, "2026-05-07")).toBe("milestone_7");
  });

  test("comeback: sober after 2+ consecutive slip days", () => {
    const history = days([
      ["2026-05-23", "sober"],
      ["2026-05-24", "minor_slip"],
      ["2026-05-25", "major_slip"],
    ]);
    expect(detectTodayEvent("sober", history, "2026-05-26")).toBe("comeback");
  });

  test("comeback: sober after 3 consecutive minor slips", () => {
    const history = days([
      ["2026-05-23", "minor_slip"],
      ["2026-05-24", "minor_slip"],
      ["2026-05-25", "minor_slip"],
    ]);
    expect(detectTodayEvent("sober", history, "2026-05-26")).toBe("comeback");
  });

  test("fresh_start: first ever check-in (no history)", () => {
    expect(detectTodayEvent("sober", [], "2026-05-26")).toBe("fresh_start");
  });

  test("fresh_start: sober after major_slip (streak broken, single slip day)", () => {
    const history = days([
      ["2026-05-24", "sober"],
      ["2026-05-25", "major_slip"],
    ]);
    expect(detectTodayEvent("sober", history, "2026-05-26")).toBe("fresh_start");
  });

  test("extended_sober after single grace minor (streak preserved)", () => {
    const history = days([
      ["2026-05-23", "sober"],
      ["2026-05-24", "sober"],
      ["2026-05-25", "minor_slip"],
    ]);
    expect(detectTodayEvent("sober", history, "2026-05-26")).toBe("extended_sober");
  });

  test("broke_sober on minor_slip that breaks streak", () => {
    const history = days([
      ["2026-05-23", "sober"],
      ["2026-05-24", "minor_slip"],
    ]);
    expect(detectTodayEvent("minor_slip", history, "2026-05-25")).toBe("broke_sober");
  });

  test("extended_sober on regular sober day continuation", () => {
    const history = days([
      ["2026-05-24", "sober"],
      ["2026-05-25", "sober"],
    ]);
    expect(detectTodayEvent("sober", history, "2026-05-26")).toBe("extended_sober");
  });
});

describe("calculateStreak alias", () => {
  test("delegates to calculateSoberStreak", () => {
    const history = days([["2026-05-25", "sober"]]);
    expect(calculateStreak(history, "2026-05-26")).toBe(0);
    expect(
      calculateStreak([...history, { date: "2026-05-26", status: "sober" }], "2026-05-26"),
    ).toBe(2);
  });
});

describe("streakLabel", () => {
  test("formats labels in Russian", () => {
    expect(streakLabel(0)).toBe("серия сброшена");
    expect(streakLabel(1)).toBe("1 день");
    expect(streakLabel(3)).toBe("3 дня");
    expect(streakLabel(12)).toBe("12 дней");
  });
});
