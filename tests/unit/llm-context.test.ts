import { describe, expect, test } from "bun:test";
import {
  formatChatBlock,
  formatRosterBlock,
  formatStyleBlock,
  shouldDeleteWindowInvitation,
} from "../../src/services/llm-context.ts";

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

  test("formatRosterBlock serializes participants", () => {
    const block = formatRosterBlock([
      {
        mention: "@bob",
        soberCurrent: 3,
        soberMax: 10,
        intoxCurrent: 0,
        intoxMax: 2,
        totalSoberDays: 5,
        totalSlipDays: 1,
      },
    ]);
    expect(block).toContain("@bob");
    expect(block).toContain('"sober": 3');
  });
});

describe("shouldDeleteWindowInvitation", () => {
  test("deletes when no reply and no reaction", () => {
    expect(shouldDeleteWindowInvitation(false, false)).toBe(true);
  });

  test("keeps when reply exists", () => {
    expect(shouldDeleteWindowInvitation(true, false)).toBe(false);
  });

  test("keeps when reaction exists", () => {
    expect(shouldDeleteWindowInvitation(false, true)).toBe(false);
  });

  test("keeps when both exist", () => {
    expect(shouldDeleteWindowInvitation(true, true)).toBe(false);
  });
});
