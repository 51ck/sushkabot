import { describe, expect, test } from "bun:test";
import { chatMembers, chats, members } from "../../src/db/schema.ts";
import { buildParticipantRosterStats } from "../../src/services/llm-context.ts";
import { createTestDb } from "../helpers/db.ts";

describe("buildParticipantRosterStats", () => {
  test("returns stats for active members", async () => {
    const { db } = createTestDb();

    const [chat] = await db
      .insert(chats)
      .values({
        telegramChatId: "-1001",
        title: "Test",
        timezone: "Europe/Moscow",
        checkinHour: 21,
        checkinMinute: 0,
        windowDurationMinutes: 120,
      })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const [member] = await db
      .insert(members)
      .values({ telegramUserId: "42", username: "alice", displayName: "Alice" })
      .returning();
    if (!member) throw new Error("expected member row");

    await db.insert(chatMembers).values({ chatId: chat.id, memberId: member.id, active: true });

    const roster = await buildParticipantRosterStats(db, chat.id, "2026-06-23");
    expect(roster).toHaveLength(1);
    expect(roster[0]?.mention).toBe("@alice");
    expect(roster[0]?.soberCurrent).toBe(0);
  });
});
