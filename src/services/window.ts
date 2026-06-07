import { and, eq } from "drizzle-orm";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chats, dailyWindows } from "../db/schema.ts";
import { countAnswered, countJoinedMembers } from "./members.ts";
import type { SchedulerService } from "./scheduler.ts";
import { postSummary } from "./summary.ts";
import { buildWindowMessage, computeCheckinDate, computeWindowClose } from "./window-message.ts";

function toIso(dt: DateTime): string {
  return dt.toISO() ?? dt.toUTC().toISO() ?? new Date().toISOString();
}

export async function openWindow(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  scheduler: SchedulerService;
  now?: DateTime;
  force?: boolean;
}): Promise<typeof dailyWindows.$inferSelect | null> {
  const { db, api, chat, scheduler } = params;
  const now = (params.now ?? DateTime.utc()).setZone(chat.timezone);
  const checkinDate = computeCheckinDate(now);

  const existing = await db.query.dailyWindows.findFirst({
    where: and(eq(dailyWindows.chatId, chat.id), eq(dailyWindows.checkinDate, checkinDate)),
  });

  if (existing) {
    if (existing.status === "open" && existing.messageId) {
      return existing;
    }
    if (existing.status !== "open" && !params.force) {
      return null;
    }
  }

  const opensAt = now.toUTC();
  const closesAt = computeWindowClose(opensAt, chat.windowDurationMinutes);

  let windowRow: typeof dailyWindows.$inferSelect;

  if (existing && params.force && existing.status !== "open") {
    await db
      .update(dailyWindows)
      .set({
        status: "open",
        windowOpensAt: toIso(opensAt),
        windowClosesAt: toIso(closesAt),
        messageId: null,
      })
      .where(eq(dailyWindows.id, existing.id));
    const updated = await db.query.dailyWindows.findFirst({
      where: eq(dailyWindows.id, existing.id),
    });
    if (!updated) throw new Error("Failed to reopen window");
    windowRow = updated;
  } else if (existing?.status === "open") {
    windowRow = existing;
  } else {
    const inserted = await db
      .insert(dailyWindows)
      .values({
        chatId: chat.id,
        checkinDate,
        windowOpensAt: toIso(opensAt),
        windowClosesAt: toIso(closesAt),
        status: "open",
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("Failed to create daily window");
    windowRow = row;
  }

  if (!windowRow.messageId) {
    const answeredCount = await countAnswered(db, windowRow.id);
    const joinedCount = await countJoinedMembers(db, chat.id);
    const { text, replyMarkup } = buildWindowMessage({
      chat,
      checkinDate: windowRow.checkinDate,
      answeredCount,
      joinedCount,
      closesAt,
      now: DateTime.utc(),
    });

    const message = await api.sendMessage(Number(chat.telegramChatId), text, {
      reply_markup: replyMarkup,
    });

    await db
      .update(dailyWindows)
      .set({ messageId: message.message_id })
      .where(eq(dailyWindows.id, windowRow.id));

    windowRow = { ...windowRow, messageId: message.message_id };
  }

  scheduler.scheduleClose(chat, windowRow);
  return windowRow;
}

export async function closeWindow(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  window: typeof dailyWindows.$inferSelect;
}): Promise<void> {
  const { db, api, chat, window } = params;

  if (window.status !== "open") {
    if (window.status === "closed") {
      await postSummary({ db, api, chat, window });
    }
    return;
  }

  const closesAt = DateTime.fromISO(window.windowClosesAt, { zone: "utc" });
  const { text } = buildWindowMessage({
    chat,
    checkinDate: window.checkinDate,
    answeredCount: await countAnswered(db, window.id),
    joinedCount: await countJoinedMembers(db, chat.id),
    closesAt,
    now: DateTime.utc(),
    closed: true,
  });

  if (window.messageId) {
    try {
      await api.editMessageText(Number(chat.telegramChatId), window.messageId, text);
    } catch {
      // ignore
    }
  }

  await db.update(dailyWindows).set({ status: "closed" }).where(eq(dailyWindows.id, window.id));

  const closedWindow = { ...window, status: "closed" as const };
  await postSummary({ db, api, chat, window: closedWindow });

  await db.update(dailyWindows).set({ status: "summarized" }).where(eq(dailyWindows.id, window.id));
}

export async function recoverStaleWindows(params: {
  db: AppDatabase;
  api: Api;
  scheduler: SchedulerService;
}): Promise<void> {
  const { db, api, scheduler } = params;
  const openWindows = await db.query.dailyWindows.findMany({
    where: eq(dailyWindows.status, "open"),
    with: { chat: true },
  });

  const now = DateTime.utc();

  for (const window of openWindows) {
    const chat = window.chat;
    if (!chat?.enabled) continue;

    const closesAt = DateTime.fromISO(window.windowClosesAt, { zone: "utc" });
    if (now >= closesAt) {
      await closeWindow({ db, api, chat, window });
    } else {
      scheduler.scheduleClose(chat, window);
    }
  }
}

export async function upsertChat(
  db: AppDatabase,
  data: {
    telegramChatId: string;
    title: string;
    timezone: string;
    checkinHour: number;
    checkinMinute: number;
    windowDurationMinutes: number;
    questionText: string;
    responseMode: string;
    buttonLabels?: string | null;
  },
): Promise<Chat> {
  const existing = await db.query.chats.findFirst({
    where: eq(chats.telegramChatId, data.telegramChatId),
  });

  if (existing) {
    const updated = await db
      .update(chats)
      .set({ ...data, enabled: true })
      .where(eq(chats.id, existing.id))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("Failed to update chat");
    return row;
  }

  const inserted = await db
    .insert(chats)
    .values({ ...data, enabled: true })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("Failed to insert chat");
  return row;
}
