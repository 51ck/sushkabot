import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { chats, checkins, dailyWindows } from "../../src/db/schema.ts";
import {
  countJoinedMembers,
  ensureMember,
  joinChatMember,
  leaveChatMember,
  recordCheckin,
} from "../../src/services/members.ts";
import { createTestDb } from "../helpers/db.ts";

describe("members and checkins", () => {
  test("join and leave updates active count", async () => {
    const { db } = createTestDb();

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-1001", title: "G" })
      .returning();
    const { memberId } = await ensureMember(db, {
      id: 42,
      username: "alice",
      first_name: "Alice",
    });
    await joinChatMember(db, chat!.id, memberId);
    expect(await countJoinedMembers(db, chat!.id)).toBe(1);

    await leaveChatMember(db, chat!.id, memberId);
    expect(await countJoinedMembers(db, chat!.id)).toBe(0);
  });

  test("recordCheckin upserts answer", async () => {
    const { db } = createTestDb();
    const api = {
      editMessageText: async () => ({ message_id: 1 }),
    };

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-1002", title: "G" })
      .returning();
    const { memberId } = await ensureMember(db, { id: 99, first_name: "Bob" });
    await joinChatMember(db, chat!.id, memberId);

    const [window] = await db
      .insert(dailyWindows)
      .values({
        chatId: chat!.id,
        checkinDate: "2026-05-26",
        windowOpensAt: "2026-05-26T21:00:00Z",
        windowClosesAt: "2026-05-26T23:00:00Z",
        messageId: 100,
        status: "open",
      })
      .returning();

    await recordCheckin({
      db,
      api: api as never,
      chat: chat!,
      window: window!,
      memberId,
      presetKey: "yes",
    });

    const rows = await db.select().from(checkins).where(eq(checkins.memberId, memberId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("sober");

    await recordCheckin({
      db,
      api: api as never,
      chat: chat!,
      window: window!,
      memberId,
      presetKey: "no",
    });

    const updated = await db.select().from(checkins).where(eq(checkins.memberId, memberId));
    expect(updated).toHaveLength(1);
    expect(updated[0]?.status).toBe("slip");
  });
});
