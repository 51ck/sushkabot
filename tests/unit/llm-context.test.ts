import { describe, expect, test } from "bun:test";
import {
  formatChatBlock,
  formatRosterBlock,
  formatScheduleBlock,
  formatStyleBlock,
} from "../../src/services/llm-context.ts";

const sampleQuality = {
  soberCurrent: 3,
  graceDaysInWindow: 0,
  calendarSpan: 3,
  soberRatio14: 1,
  quality: "solid" as const,
  pattern: "-----KKK",
};

describe("llm-context formatters", () => {
  test("formatChatBlock returns placeholder when empty", () => {
    expect(formatChatBlock([])).toBe("(тишина в чате)");
  });

  test("formatChatBlock renders snippets", () => {
    const block = formatChatBlock([{ authorName: "@alice", text: "привет" }]);
    expect(block).toContain("@alice: привет");
  });

  test("formatStyleBlock returns placeholder when empty", () => {
    expect(formatStyleBlock([])).toBe("(нет примеров)");
  });

  test("formatRosterBlock renders compact quality lines", () => {
    const block = formatRosterBlock([
      {
        mention: "@bob",
        soberCurrent: 3,
        soberMax: 10,
        intoxCurrent: 0,
        intoxMax: 2,
        totalSoberDays: 5,
        totalSlipDays: 1,
        quality: sampleQuality,
      },
    ]);
    expect(block).toContain("@bob");
    expect(block).toContain("quality=solid");
    expect(block).toContain("pattern=");
  });

  test("formatScheduleBlock includes local times", () => {
    const block = formatScheduleBlock({
      timezone: "Europe/Moscow",
      checkinOpens: "21:00",
      windowCloses: "23:00",
      windowDurationMinutes: 120,
      nowLocal: "21:30",
    });
    expect(block).toContain("timezone: Europe/Moscow");
    expect(block).toContain("window_closes: 23:00");
  });
});
