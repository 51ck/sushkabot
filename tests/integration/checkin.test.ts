import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { chats, checkins, dailyWindows } from "../../src/db/schema.ts";
import {
  countJoinedMembers,
  ensureMember,
  joinChatMember,
  leaveChatMember,
  recordAbsentAsMinorSlip,
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
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, {
      id: 42,
      username: "alice",
      first_name: "Alice",
    });
    await joinChatMember(db, chat.id, memberId);
    expect(await countJoinedMembers(db, chat.id)).toBe(1);

    await leaveChatMember(db, chat.id, memberId);
    expect(await countJoinedMembers(db, chat.id)).toBe(0);
  });

  test("recordCheckin upserts answer", async () => {
    const { db } = createTestDb();
    const api = {
      editMessageText: async () => ({ message_id: 1 }),
    };

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-1002", title: "G", graceMinSoberDays: 0 })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, { id: 99, first_name: "Bob" });
    await joinChatMember(db, chat.id, memberId);

    const [window] = await db
      .insert(dailyWindows)
      .values({
        chatId: chat.id,
        checkinDate: "2026-05-26",
        windowOpensAt: "2026-05-26T21:00:00Z",
        windowClosesAt: "2026-05-26T23:00:00Z",
        messageId: 100,
        status: "open",
      })
      .returning();
    if (!window) throw new Error("expected window row");

    await recordCheckin({
      db,
      api: api as never,
      chat,
      window,
      memberId,
      buttonKey: "krasavchik",
    });

    const rows = await db.select().from(checkins).where(eq(checkins.memberId, memberId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("sober");

    await recordCheckin({
      db,
      api: api as never,
      chat,
      window,
      memberId,
      buttonKey: "ostupilsya",
    });

    const updated = await db.select().from(checkins).where(eq(checkins.memberId, memberId));
    expect(updated).toHaveLength(1);
    expect(updated[0]?.status).toBe("minor_slip");
  });

  test("ostupilsya escalates when previous day was minor slip", async () => {
    const { db } = createTestDb();
    const api = { editMessageText: async () => ({ message_id: 1 }) };

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-1003", title: "G", graceMinSoberDays: 0 })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, { id: 77, first_name: "Carl" });
    await joinChatMember(db, chat.id, memberId);

    const [prevWindow] = await db
      .insert(dailyWindows)
      .values({
        chatId: chat.id,
        checkinDate: "2026-05-25",
        windowOpensAt: "2026-05-25T21:00:00Z",
        windowClosesAt: "2026-05-25T23:00:00Z",
        status: "closed",
      })
      .returning();
    if (!prevWindow) throw new Error("expected prev window");

    await db.insert(checkins).values({
      dailyWindowId: prevWindow.id,
      chatId: chat.id,
      memberId,
      checkinDate: "2026-05-25",
      status: "minor_slip",
    });

    const [window] = await db
      .insert(dailyWindows)
      .values({
        chatId: chat.id,
        checkinDate: "2026-05-26",
        windowOpensAt: "2026-05-26T21:00:00Z",
        windowClosesAt: "2026-05-26T23:00:00Z",
        messageId: 101,
        status: "open",
      })
      .returning();
    if (!window) throw new Error("expected window row");

    const status = await recordCheckin({
      db,
      api: api as never,
      chat,
      window,
      memberId,
      buttonKey: "ostupilsya",
    });

    expect(status).toBe("major_slip");
  });

  test("ostupilsya is major when sober streak below grace threshold", async () => {
    const { db } = createTestDb();
    const api = { editMessageText: async () => ({ message_id: 1 }) };

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-1005", title: "G", graceMinSoberDays: 7 })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, { id: 88, first_name: "Dana" });
    await joinChatMember(db, chat.id, memberId);

    const [window] = await db
      .insert(dailyWindows)
      .values({
        chatId: chat.id,
        checkinDate: "2026-05-26",
        windowOpensAt: "2026-05-26T21:00:00Z",
        windowClosesAt: "2026-05-26T23:00:00Z",
        messageId: 102,
        status: "open",
      })
      .returning();
    if (!window) throw new Error("expected window row");

    const status = await recordCheckin({
      db,
      api: api as never,
      chat,
      window,
      memberId,
      buttonKey: "ostupilsya",
    });

    expect(status).toBe("major_slip");
  });

  test("recordAbsentAsMinorSlip fills missing answers", async () => {
    const { db } = createTestDb();

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-1004", title: "G", graceMinSoberDays: 0 })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId: a } = await ensureMember(db, { id: 1, first_name: "A" });
    const { memberId: b } = await ensureMember(db, { id: 2, first_name: "B" });
    await joinChatMember(db, chat.id, a);
    await joinChatMember(db, chat.id, b);

    const [window] = await db
      .insert(dailyWindows)
      .values({
        chatId: chat.id,
        checkinDate: "2026-05-26",
        windowOpensAt: "2026-05-26T21:00:00Z",
        windowClosesAt: "2026-05-26T23:00:00Z",
        status: "open",
      })
      .returning();
    if (!window) throw new Error("expected window row");

    await db.insert(checkins).values({
      dailyWindowId: window.id,
      chatId: chat.id,
      memberId: a,
      checkinDate: "2026-05-26",
      status: "sober",
    });

    const created = await recordAbsentAsMinorSlip({ db, chat, window });
    expect(created).toBe(1);

    const rows = await db.select().from(checkins).where(eq(checkins.dailyWindowId, window.id));
    expect(rows).toHaveLength(2);
    const silent = rows.find((r) => r.memberId === b);
    expect(silent?.status).toBe("minor_slip");
  });
});
