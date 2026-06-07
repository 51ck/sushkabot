import { and, count, eq, sql } from "drizzle-orm";
import type { Api, Bot } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chatMembers, chats, checkins, dailyWindows, members } from "../db/schema.ts";
import {
  type CheckinStatus,
  type PresetButtonKey,
  presetKeyToStatus,
  type ResponseMode,
} from "../types.ts";
import { debouncedEditMessage } from "./message-debounce.ts";
import { buildWindowMessage } from "./window-message.ts";

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

export async function refreshWindowMessage(
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
  const { text, replyMarkup } = buildWindowMessage({
    chat,
    checkinDate: window.checkinDate,
    answeredCount,
    joinedCount,
    closesAt,
    now,
    closed: window.status !== "open",
  });

  await debouncedEditMessage(api, {
    chat_id: Number(chat.telegramChatId),
    message_id: window.messageId,
    text,
    reply_markup: replyMarkup,
  });
}

export async function recordCheckin(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  window: typeof dailyWindows.$inferSelect;
  memberId: number;
  presetKey: PresetButtonKey;
}): Promise<CheckinStatus> {
  const { db, api, chat, window, memberId, presetKey } = params;
  const mode = chat.responseMode as ResponseMode;
  const status = presetKeyToStatus(mode, presetKey);

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

export type BotLike = Pick<Bot, "api">;
