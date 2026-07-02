import { describe, expect, test } from "bun:test";
import { chats, checkins, dailyWindows } from "../../src/db/schema.ts";
import { countJoinedMembers, ensureMember, joinChatMember } from "../../src/services/members.ts";
import { deactivateRosterMember } from "../../src/services/roster-lifecycle.ts";
import { createTestDb } from "../helpers/db.ts";

describe("deactivateRosterMember", () => {
  test("removes active member from roster", async () => {
    const { db } = createTestDb();
    const api = {
      editMessageText: async () => ({ message_id: 1 }),
      sendMessage: async () => ({ message_id: 2 }),
    };

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-2001", title: "G" })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, { id: 55, first_name: "Leaver" });
    await joinChatMember(db, chat.id, memberId);

    const removed = await deactivateRosterMember({
      db,
      api: api as never,
      chat,
      memberId,
    });

    expect(removed).toBe(true);
    expect(await countJoinedMembers(db, chat.id)).toBe(0);

    const row = await db.query.chatMembers.findFirst({
      where: (cm, { and, eq }) => and(eq(cm.chatId, chat.id), eq(cm.memberId, memberId)),
    });
    expect(row?.active).toBe(false);
  });

  test("early-closes open window when remaining members already answered", async () => {
    const { db } = createTestDb();
    const api = {
      editMessageText: async () => ({ message_id: 1 }),
      sendMessage: async () => ({ message_id: 2 }),
    };

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-2002", title: "G", graceMinSoberDays: 0 })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId: stay } = await ensureMember(db, { id: 1, first_name: "Stay" });
    const { memberId: leave } = await ensureMember(db, { id: 2, first_name: "Leave" });
    await joinChatMember(db, chat.id, stay);
    await joinChatMember(db, chat.id, leave);

    const [window] = await db
      .insert(dailyWindows)
      .values({
        chatId: chat.id,
        checkinDate: "2026-05-26",
        windowOpensAt: "2026-05-26T21:00:00Z",
        windowClosesAt: "2026-05-26T23:00:00Z",
        messageId: 300,
        status: "open",
        generatedBody: "test",
      })
      .returning();
    if (!window) throw new Error("expected window row");

    await db.insert(checkins).values({
      dailyWindowId: window.id,
      chatId: chat.id,
      memberId: stay,
      checkinDate: "2026-05-26",
      status: "sober",
    });

    const removed = await deactivateRosterMember({
      db,
      api: api as never,
      chat,
      memberId: leave,
    });

    expect(removed).toBe(true);

    const updated = await db.query.dailyWindows.findFirst({
      where: (w, { eq }) => eq(w.id, window.id),
    });
    expect(updated?.status).toBe("summarized");
  });

  test("no-op when member was not on roster", async () => {
    const { db } = createTestDb();
    const api = { sendMessage: async () => ({ message_id: 1 }) };

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-2003", title: "G" })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, { id: 99, first_name: "Ghost" });

    const removed = await deactivateRosterMember({
      db,
      api: api as never,
      chat,
      memberId,
    });

    expect(removed).toBe(false);
  });
});
