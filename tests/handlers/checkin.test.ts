import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Update } from "grammy/types";
import { createBot } from "../../src/bot/bot.ts";
import { chats, dailyWindows } from "../../src/db/schema.ts";
import { ensureMember, joinChatMember } from "../../src/services/members.ts";
import { fixedNow, resetClock } from "../helpers/clock.ts";
import { createTestDb } from "../helpers/db.ts";

describe("checkin callback handler", () => {
  afterEach(() => {
    resetClock();
  });

  test("records checkin on button tap", async () => {
    fixedNow("2026-05-26T22:00:00Z");

    const { db } = createTestDb();
    const apiCalls: string[] = [];

    const { bot } = createBot("TEST_TOKEN", db, {
      botInfo: {
        id: 999,
        is_bot: true,
        first_name: "Test",
        username: "testbot",
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false,
        can_connect_to_business: false,
        can_manage_bots: false,
        has_main_web_app: false,
        has_topics_enabled: false,
        allows_users_to_create_topics: false,
      },
      client: {
        fetch: async (url: string | URL | Request, init?: RequestInit) => {
          const method = url.toString().split("/").pop() ?? "";
          apiCalls.push(method);
          if (method === "editMessageText" || method === "sendMessage") {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            return new Response(
              JSON.stringify({
                ok: true,
                result: {
                  message_id: body.message_id ?? 101,
                  date: 0,
                  chat: { id: body.chat_id ?? -100999, type: "supergroup" },
                  text: body.text ?? "",
                },
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ ok: true, result: true }), {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-100999", title: "Test Group" })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, {
      id: 123456,
      username: "alice",
      first_name: "Alice",
    });
    await joinChatMember(db, chat.id, memberId);

    await db.insert(dailyWindows).values({
      chatId: chat.id,
      checkinDate: "2026-05-26",
      windowOpensAt: "2026-05-26T21:00:00Z",
      windowClosesAt: "2026-05-27T23:00:00Z",
      messageId: 100,
      status: "open",
    });

    const update = JSON.parse(
      readFileSync(`${import.meta.dir}/../fixtures/updates/callback-checkin-yes.json`, "utf-8"),
    ) as Update;

    await bot.handleUpdate(update);

    expect(apiCalls).toContain("answerCallbackQuery");

    const member = await db.query.members.findFirst({
      where: (m, { eq }) => eq(m.telegramUserId, "123456"),
    });
    expect(member).toBeDefined();

    const checkinRows = await db.query.checkins.findMany();
    expect(checkinRows.length).toBe(1);
    expect(checkinRows[0]?.status).toBe("sober");
  });

  test("rejects checkin when member has not joined", async () => {
    fixedNow("2026-05-26T22:00:00Z");

    const { db } = createTestDb();
    const { bot } = createBot("TEST_TOKEN", db, {
      botInfo: {
        id: 999,
        is_bot: true,
        first_name: "Test",
        username: "testbot",
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false,
        can_connect_to_business: false,
        can_manage_bots: false,
        has_main_web_app: false,
        has_topics_enabled: false,
        allows_users_to_create_topics: false,
      },
      client: {
        fetch: async () =>
          new Response(JSON.stringify({ ok: true, result: true }), {
            headers: { "Content-Type": "application/json" },
          }),
      },
    });

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-100999", title: "Test Group" })
      .returning();
    if (!chat) throw new Error("expected chat row");

    await db.insert(dailyWindows).values({
      chatId: chat.id,
      checkinDate: "2026-05-26",
      windowOpensAt: "2026-05-26T21:00:00Z",
      windowClosesAt: "2026-05-27T23:00:00Z",
      messageId: 100,
      status: "open",
    });

    const update = JSON.parse(
      readFileSync(`${import.meta.dir}/../fixtures/updates/callback-checkin-yes.json`, "utf-8"),
    ) as Update;

    await bot.handleUpdate(update);

    const checkinRows = await db.query.checkins.findMany();
    expect(checkinRows).toHaveLength(0);
  });

  test("closes window early when all joined members answered", async () => {
    fixedNow("2026-05-26T22:00:00Z");

    const { db } = createTestDb();
    const { bot } = createBot("TEST_TOKEN", db, {
      botInfo: {
        id: 999,
        is_bot: true,
        first_name: "Test",
        username: "testbot",
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false,
        can_connect_to_business: false,
        can_manage_bots: false,
        has_main_web_app: false,
        has_topics_enabled: false,
        allows_users_to_create_topics: false,
      },
      client: {
        fetch: async (url: string | URL | Request, init?: RequestInit) => {
          const method = url.toString().split("/").pop() ?? "";
          if (method === "editMessageText" || method === "sendMessage") {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            return new Response(
              JSON.stringify({
                ok: true,
                result: {
                  message_id: body.message_id ?? 101,
                  date: 0,
                  chat: { id: body.chat_id ?? -100999, type: "supergroup" },
                  text: body.text ?? "",
                },
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ ok: true, result: true }), {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-100999", title: "Test Group", graceMinSoberDays: 0 })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, {
      id: 123456,
      username: "alice",
      first_name: "Alice",
    });
    await joinChatMember(db, chat.id, memberId);

    const [window] = await db
      .insert(dailyWindows)
      .values({
        chatId: chat.id,
        checkinDate: "2026-05-26",
        windowOpensAt: "2026-05-26T21:00:00Z",
        windowClosesAt: "2026-05-27T23:00:00Z",
        messageId: 100,
        status: "open",
        generatedBody: "Оступился сегодня?",
      })
      .returning();
    if (!window) throw new Error("expected window row");

    const update = JSON.parse(
      readFileSync(`${import.meta.dir}/../fixtures/updates/callback-checkin-yes.json`, "utf-8"),
    ) as Update;

    await bot.handleUpdate(update);

    const closed = await db.query.dailyWindows.findFirst({
      where: (w, { eq }) => eq(w.id, window.id),
    });
    expect(closed?.status).toBe("summarized");
  });

  test("left_chat_member removes user from roster", async () => {
    fixedNow("2026-05-26T22:00:00Z");

    const { db } = createTestDb();
    const { bot } = createBot("TEST_TOKEN", db, {
      botInfo: {
        id: 999,
        is_bot: true,
        first_name: "Test",
        username: "testbot",
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false,
        can_connect_to_business: false,
        can_manage_bots: false,
        has_main_web_app: false,
        has_topics_enabled: false,
        allows_users_to_create_topics: false,
      },
      client: {
        fetch: async () =>
          new Response(JSON.stringify({ ok: true, result: true }), {
            headers: { "Content-Type": "application/json" },
          }),
      },
    });

    const [chat] = await db
      .insert(chats)
      .values({ telegramChatId: "-100999", title: "Test Group" })
      .returning();
    if (!chat) throw new Error("expected chat row");

    const { memberId } = await ensureMember(db, {
      id: 123456,
      username: "alice",
      first_name: "Alice",
    });
    await joinChatMember(db, chat.id, memberId);
    expect(
      await db.query.chatMembers.findFirst({
        where: (cm, { and, eq }) =>
          and(eq(cm.chatId, chat.id), eq(cm.memberId, memberId), eq(cm.active, true)),
      }),
    ).toBeDefined();

    const update = JSON.parse(
      readFileSync(`${import.meta.dir}/../fixtures/updates/message-left-member.json`, "utf-8"),
    ) as Update;

    await bot.handleUpdate(update);

    const row = await db.query.chatMembers.findFirst({
      where: (cm, { and, eq }) => and(eq(cm.chatId, chat.id), eq(cm.memberId, memberId)),
    });
    expect(row?.active).toBe(false);
  });
});
