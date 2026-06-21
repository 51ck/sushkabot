import { and, count, eq, sql } from "drizzle-orm";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chatMembers, chats, checkins, dailyWindows, members } from "../db/schema.ts";
import { type CheckinButtonKey, type CheckinStatus, resolveCheckinStatus } from "../types.ts";
import { getPreviousDayStatus } from "./checkin-status.ts";
import { buildWindowHighlightContext, highlightsHash } from "./highlights.ts";
import { generateLiveWindowBody } from "./llm.ts";
import { getRecentLlmGenerations, recordLlmGeneration } from "./llm-generations.ts";
import { debouncedEditMessage, debouncedLlmRegen } from "./message-debounce.ts";
import { buildWindowMessage } from "./window-message.ts";

const lastHighlightHash = new Map<string, string>();

export async function getChatByTelegramId(
  db: AppDatabase,
  telegramChatId: string,
): Promise<Chat | undefined> {
  return db.query.chats.findFirst({
    where: eq(chats.telegramChatId, telegramChatId),
  });
}

export async function ensureMember(
  db: AppDatabase,
  user: { id: number; username?: string; first_name?: string; last_name?: string },
): Promise<{ memberId: number }> {
  const telegramUserId = String(user.id);
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "User";

  let member = await db.query.members.findFirst({
    where: eq(members.telegramUserId, telegramUserId),
  });

  if (!member) {
    const inserted = await db
      .insert(members)
      .values({
        telegramUserId,
        username: user.username ?? null,
        displayName,
      })
      .returning();
    member = inserted[0];
  } else {
    await db
      .update(members)
      .set({
        username: user.username ?? null,
        displayName,
      })
      .where(eq(members.id, member.id));
  }

  if (!member) throw new Error("Failed to upsert member");
  return { memberId: member.id };
}

export async function joinChatMember(
  db: AppDatabase,
  chatId: number,
  memberId: number,
): Promise<void> {
  const existing = await db.query.chatMembers.findFirst({
    where: and(eq(chatMembers.chatId, chatId), eq(chatMembers.memberId, memberId)),
  });

  if (existing) {
    if (!existing.active) {
      await db
        .update(chatMembers)
        .set({ active: true, leftAt: null, joinedAt: sql`datetime('now')` })
        .where(eq(chatMembers.id, existing.id));
    }
    return;
  }

  await db.insert(chatMembers).values({ chatId, memberId, active: true });
}

export async function leaveChatMember(
  db: AppDatabase,
  chatId: number,
  memberId: number,
): Promise<void> {
  await db
    .update(chatMembers)
    .set({ active: false, leftAt: sql`datetime('now')` })
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.memberId, memberId)));
}

export async function countJoinedMembers(db: AppDatabase, chatId: number): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.active, true)));
  return result[0]?.value ?? 0;
}

export async function countAnswered(db: AppDatabase, dailyWindowId: number): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(checkins)
    .where(eq(checkins.dailyWindowId, dailyWindowId));
  return result[0]?.value ?? 0;
}

export async function getOpenWindow(
  db: AppDatabase,
  chatId: number,
  checkinDate: string,
): Promise<typeof dailyWindows.$inferSelect | undefined> {
  return db.query.dailyWindows.findFirst({
    where: and(
      eq(dailyWindows.chatId, chatId),
      eq(dailyWindows.checkinDate, checkinDate),
      eq(dailyWindows.status, "open"),
    ),
  });
}

async function applyWindowMessageEdit(
  api: Api,
  db: AppDatabase,
  chat: Chat,
  window: typeof dailyWindows.$inferSelect,
): Promise<void> {
  if (!window.messageId) return;

  const answeredCount = await countAnswered(db, window.id);
  const joinedCount = await countJoinedMembers(db, chat.id);
  const now = DateTime.utc();
  const closesAt = DateTime.fromISO(window.windowClosesAt, { zone: "utc" });
  const body = window.liveBody ?? window.generatedBody;

  const { text, replyMarkup } = buildWindowMessage({
    chat,
    checkinDate: window.checkinDate,
    answeredCount,
    joinedCount,
    closesAt,
    now,
    closed: window.status !== "open",
    generatedBody: body,
  });

  await debouncedEditMessage(api, {
    chat_id: Number(chat.telegramChatId),
    message_id: window.messageId,
    text,
    reply_markup: replyMarkup,
  });
}

function scheduleLiveWindowRegen(api: Api, db: AppDatabase, chat: Chat, windowId: number): void {
  const regenKey = `live:${chat.id}:${windowId}`;

  debouncedLlmRegen(regenKey, async () => {
    const window = await db.query.dailyWindows.findFirst({
      where: eq(dailyWindows.id, windowId),
    });
    if (!window || window.status !== "open" || !window.messageId) return;

    const answeredCount = await countAnswered(db, window.id);
    const joinedCount = await countJoinedMembers(db, chat.id);
    const closesAt = DateTime.fromISO(window.windowClosesAt, { zone: "utc" });
    const styleExamples = await getRecentLlmGenerations(db, chat.id);

    const ctx = await buildWindowHighlightContext({
      db,
      chatId: chat.id,
      windowId: window.id,
      checkinDate: window.checkinDate,
      answeredCount,
      joinedCount,
      closesAt,
      styleExamples,
    });

    const hash = highlightsHash(ctx.highlights);
    const hashKey = `${chat.id}:${window.id}`;
    if (lastHighlightHash.get(hashKey) === hash && window.liveBody) return;
    lastHighlightHash.set(hashKey, hash);

    const liveBody = await generateLiveWindowBody(ctx);
    if (!liveBody) {
      await applyWindowMessageEdit(api, db, chat, window);
      return;
    }

    const nowIso = DateTime.utc().toISO() ?? new Date().toISOString();
    await db
      .update(dailyWindows)
      .set({ liveBody, liveBodyAt: nowIso })
      .where(eq(dailyWindows.id, window.id));

    await recordLlmGeneration({ db, chatId: chat.id, kind: "live", text: liveBody });

    const updated = { ...window, liveBody, liveBodyAt: nowIso };
    await applyWindowMessageEdit(api, db, chat, updated);
  });
}

export async function refreshWindowMessage(
  api: Api,
  db: AppDatabase,
  chat: Chat,
  window: typeof dailyWindows.$inferSelect,
): Promise<void> {
  await applyWindowMessageEdit(api, db, chat, window);
  if (window.status === "open") {
    scheduleLiveWindowRegen(api, db, chat, window.id);
  }
}

export async function recordCheckin(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  window: typeof dailyWindows.$inferSelect;
  memberId: number;
  buttonKey: CheckinButtonKey;
}): Promise<CheckinStatus> {
  const { db, api, chat, window, memberId, buttonKey } = params;

  const previousDayStatus = await getPreviousDayStatus({
    db,
    chatId: chat.id,
    memberId,
    checkinDate: window.checkinDate,
  });
  const status = resolveCheckinStatus(buttonKey, previousDayStatus);

  const existing = await db.query.checkins.findFirst({
    where: and(eq(checkins.dailyWindowId, window.id), eq(checkins.memberId, memberId)),
  });

  if (existing) {
    await db
      .update(checkins)
      .set({ status, answeredAt: sql`datetime('now')` })
      .where(eq(checkins.id, existing.id));
  } else {
    await db.insert(checkins).values({
      dailyWindowId: window.id,
      chatId: chat.id,
      memberId,
      checkinDate: window.checkinDate,
      status,
    });
  }

  await refreshWindowMessage(api, db, chat, window);
  return status;
}

/** Joined members who never answered get «оступился» when the window closes. */
export async function recordAbsentAsMinorSlip(params: {
  db: AppDatabase;
  chatId: number;
  window: typeof dailyWindows.$inferSelect;
}): Promise<number> {
  const { db, chatId, window } = params;

  const joined = await db.query.chatMembers.findMany({
    where: and(eq(chatMembers.chatId, chatId), eq(chatMembers.active, true)),
  });

  const existing = await db.query.checkins.findMany({
    where: eq(checkins.dailyWindowId, window.id),
  });
  const answeredMemberIds = new Set(existing.map((c) => c.memberId));

  let created = 0;
  for (const member of joined) {
    if (answeredMemberIds.has(member.memberId)) continue;

    await db.insert(checkins).values({
      dailyWindowId: window.id,
      chatId,
      memberId: member.memberId,
      checkinDate: window.checkinDate,
      status: "minor_slip",
    });
    created += 1;
  }

  return created;
}
