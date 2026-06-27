import { and, eq } from "drizzle-orm";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chats, dailyWindows } from "../db/schema.ts";
import { trackBotPost } from "./bot-posts.ts";
import { generateCheckinBody, isLlmFallbackText } from "./llm.ts";
import { buildLlmBaseContext } from "./llm-context.ts";
import { recordLlmGeneration } from "./llm-generations.ts";
import { countAnswered, countJoinedMembers, recordAbsentAsMinorSlip } from "./members.ts";
import { postMilestoneCelebrations } from "./milestone.ts";
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
    if (existing.status === "open" && existing.messageId && !params.force) {
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
        generatedBody: null,
        generatedSummaryIntro: null,
        liveBody: null,
        liveBodyAt: null,
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

  const forceRegenerate =
    Boolean(params.force) && windowRow.status === "open" && Boolean(windowRow.messageId);

  if (forceRegenerate) {
    await db
      .update(dailyWindows)
      .set({
        generatedBody: null,
        liveBody: null,
        liveBodyAt: null,
        windowOpensAt: toIso(opensAt),
        windowClosesAt: toIso(closesAt),
      })
      .where(eq(dailyWindows.id, windowRow.id));
    windowRow = {
      ...windowRow,
      generatedBody: null,
      liveBody: null,
      liveBodyAt: null,
    };
  }

  if (!windowRow.messageId || forceRegenerate) {
    const answeredCount = await countAnswered(db, windowRow.id);
    const joinedCount = await countJoinedMembers(db, chat.id);

    let generatedBody = windowRow.generatedBody;
    if (!generatedBody) {
      const llmCtx = await buildLlmBaseContext({
        db,
        chat,
        asOfDate: windowRow.checkinDate,
        closesAt,
        now,
        kind: "open",
      });
      generatedBody = await generateCheckinBody({
        ...llmCtx,
        date: windowRow.checkinDate,
        answeredCount,
        joinedCount,
      });
      await db.update(dailyWindows).set({ generatedBody }).where(eq(dailyWindows.id, windowRow.id));
      if (!isLlmFallbackText(generatedBody)) {
        await recordLlmGeneration({ db, chatId: chat.id, kind: "open", text: generatedBody });
      }
      windowRow = { ...windowRow, generatedBody };
    }

    const { text, replyMarkup } = buildWindowMessage({
      chat,
      checkinDate: windowRow.checkinDate,
      answeredCount,
      joinedCount,
      closesAt,
      now: DateTime.utc(),
      generatedBody,
    });

    if (!windowRow.messageId) {
      const message = await api.sendMessage(Number(chat.telegramChatId), text, {
        reply_markup: replyMarkup,
      });

      await db
        .update(dailyWindows)
        .set({ messageId: message.message_id })
        .where(eq(dailyWindows.id, windowRow.id));

      await trackBotPost({
        db,
        chatId: chat.id,
        telegramMessageId: message.message_id,
        kind: "window",
        dailyWindowId: windowRow.id,
      });

      windowRow = { ...windowRow, messageId: message.message_id };
    } else {
      try {
        await api.editMessageText(Number(chat.telegramChatId), windowRow.messageId, text, {
          reply_markup: replyMarkup,
        });
      } catch {
        // ignore
      }
    }
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

  await recordAbsentAsMinorSlip({ db, chatId: chat.id, window });

  const closesAt = DateTime.fromISO(window.windowClosesAt, { zone: "utc" });
  const answeredCount = await countAnswered(db, window.id);
  const joinedCount = await countJoinedMembers(db, chat.id);
  const body = window.liveBody ?? window.generatedBody;

  if (window.messageId) {
    const { text } = buildWindowMessage({
      chat,
      checkinDate: window.checkinDate,
      answeredCount,
      joinedCount,
      closesAt,
      now: DateTime.utc(),
      closed: true,
      generatedBody: body,
    });

    try {
      await api.editMessageText(Number(chat.telegramChatId), window.messageId, text);
    } catch {
      // ignore
    }
  }

  await db.update(dailyWindows).set({ status: "closed" }).where(eq(dailyWindows.id, window.id));

  const closedWindow = { ...window, status: "closed" as const };
  await postSummary({ db, api, chat, window: closedWindow });
  try {
    await postMilestoneCelebrations({ db, api, chat, window: closedWindow });
  } catch (err) {
    console.error(`Milestone celebration failed for chat ${chat.id}:`, err);
  }

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
    questionText?: string;
    responseMode?: string;
    buttonLabels?: string | null;
  },
): Promise<Chat> {
  const payload = {
    ...data,
    questionText: data.questionText ?? "Оступился сегодня?",
    responseMode: data.responseMode ?? "sushka",
    buttonLabels: data.buttonLabels ?? null,
    enabled: true as const,
  };

  const existing = await db.query.chats.findFirst({
    where: eq(chats.telegramChatId, data.telegramChatId),
  });

  if (existing) {
    const updated = await db
      .update(chats)
      .set(payload)
      .where(eq(chats.id, existing.id))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("Failed to update chat");
    return row;
  }

  const inserted = await db.insert(chats).values(payload).returning();
  const row = inserted[0];
  if (!row) throw new Error("Failed to insert chat");
  return row;
}
