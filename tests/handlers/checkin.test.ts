import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Update } from "grammy/types";
import { createBot } from "../../src/bot/bot.ts";
import { chats, dailyWindows } from "../../src/db/schema.ts";
import { createTestDb } from "../helpers/db.ts";

describe("checkin callback handler", () => {
  test("records checkin on button tap", async () => {
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
          if (method === "editMessageText") {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            return new Response(
              JSON.stringify({
                ok: true,
                result: {
                  message_id: body.message_id ?? 100,
                  date: 0,
                  chat: { id: body.chat_id, type: "supergroup" },
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

    await db.insert(dailyWindows).values({
      chatId: chat!.id,
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
});
