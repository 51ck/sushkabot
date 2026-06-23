import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type BotPostKind, botPosts } from "../db/schema.ts";

export async function trackBotPost(params: {
  db: AppDatabase;
  chatId: number;
  telegramMessageId: number;
  kind: BotPostKind;
  dailyWindowId?: number | null;
  deleteAfter?: DateTime | null;
}): Promise<void> {
  const { db, chatId, telegramMessageId, kind, dailyWindowId, deleteAfter } = params;

  await db
    .insert(botPosts)
    .values({
      chatId,
      telegramMessageId,
      kind,
      dailyWindowId: dailyWindowId ?? null,
      deleteAfter: deleteAfter?.toISO() ?? null,
    })
    .onConflictDoUpdate({
      target: [botPosts.chatId, botPosts.telegramMessageId],
      set: {
        kind,
        dailyWindowId: dailyWindowId ?? null,
        deleteAfter: deleteAfter?.toISO() ?? null,
        deletedAt: null,
      },
    });
}

export async function markBotPostReplied(
  db: AppDatabase,
  chatId: number,
  telegramMessageId: number,
): Promise<void> {
  await db
    .update(botPosts)
    .set({ hasReply: true, deleteAfter: null })
    .where(and(eq(botPosts.chatId, chatId), eq(botPosts.telegramMessageId, telegramMessageId)));
}

export async function markBotPostReacted(
  db: AppDatabase,
  chatId: number,
  telegramMessageId: number,
): Promise<void> {
  await db
    .update(botPosts)
    .set({ hasReaction: true, deleteAfter: null })
    .where(and(eq(botPosts.chatId, chatId), eq(botPosts.telegramMessageId, telegramMessageId)));
}

export async function findBotPost(
  db: AppDatabase,
  chatId: number,
  telegramMessageId: number,
): Promise<typeof botPosts.$inferSelect | undefined> {
  return db.query.botPosts.findFirst({
    where: and(eq(botPosts.chatId, chatId), eq(botPosts.telegramMessageId, telegramMessageId)),
  });
}

async function tryDeleteBotPost(
  api: Api,
  db: AppDatabase,
  post: typeof botPosts.$inferSelect,
  telegramChatId: string,
): Promise<void> {
  if (post.deletedAt || post.hasReply) return;

  try {
    await api.deleteMessage(Number(telegramChatId), post.telegramMessageId);
  } catch (error) {
    console.warn("Failed to delete bot message", post.telegramMessageId, error);
  }

  await db
    .update(botPosts)
    .set({ deletedAt: DateTime.utc().toISO() })
    .where(eq(botPosts.id, post.id));
}

/** Delete bot posts without replies when opening a new window (except current window message). */
export async function cleanupStaleBotPosts(params: {
  db: AppDatabase;
  api: Api;
  chatId: number;
  telegramChatId: string;
  keepMessageId?: number | null;
}): Promise<void> {
  const { db, api, chatId, telegramChatId, keepMessageId } = params;

  const stale = await db.query.botPosts.findMany({
    where: and(
      eq(botPosts.chatId, chatId),
      eq(botPosts.hasReply, false),
      isNull(botPosts.deletedAt),
    ),
  });

  for (const post of stale) {
    if (keepMessageId && post.telegramMessageId === keepMessageId) continue;
    await tryDeleteBotPost(api, db, post, telegramChatId);
  }
}

/** Delete stats posts past delete_after TTL if still no reply. */
export async function cleanupExpiredBotPosts(params: { db: AppDatabase; api: Api }): Promise<void> {
  const { db, api } = params;
  const nowIso = DateTime.utc().toISO() ?? new Date().toISOString();

  const expired = await db.query.botPosts.findMany({
    where: and(
      eq(botPosts.hasReply, false),
      isNull(botPosts.deletedAt),
      lte(botPosts.deleteAfter, nowIso),
    ),
    with: { chat: true },
  });

  for (const post of expired) {
    const chat = post.chat;
    if (!chat) continue;
    await tryDeleteBotPost(api, db, post, chat.telegramChatId);
  }
}

export async function cleanupWindowPostsWithoutReply(params: {
  db: AppDatabase;
  api: Api;
  chatId: number;
  telegramChatId: string;
  dailyWindowId: number;
  exceptMessageId?: number | null;
}): Promise<void> {
  const { db, api, chatId, telegramChatId, dailyWindowId, exceptMessageId } = params;

  const posts = await db.query.botPosts.findMany({
    where: and(
      eq(botPosts.chatId, chatId),
      eq(botPosts.dailyWindowId, dailyWindowId),
      inArray(botPosts.kind, ["window", "summary"]),
      eq(botPosts.hasReply, false),
      isNull(botPosts.deletedAt),
    ),
  });

  for (const post of posts) {
    if (exceptMessageId && post.telegramMessageId === exceptMessageId) continue;
    await tryDeleteBotPost(api, db, post, telegramChatId);
  }
}
