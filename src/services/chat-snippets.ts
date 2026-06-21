import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.ts";
import { chatSnippets } from "../db/schema.ts";
import { env } from "../env.ts";

export async function appendChatSnippet(params: {
  db: AppDatabase;
  chatId: number;
  telegramMessageId: number;
  authorName: string;
  text: string;
}): Promise<void> {
  const { db, chatId, telegramMessageId, authorName, text } = params;
  const trimmed = text.trim();
  if (!trimmed) return;

  await db.insert(chatSnippets).values({
    chatId,
    telegramMessageId,
    authorName,
    text: trimmed.slice(0, 500),
  });

  const limit = env.CHAT_SNIPPET_LIMIT;
  const rows = await db.query.chatSnippets.findMany({
    where: eq(chatSnippets.chatId, chatId),
    orderBy: desc(chatSnippets.id),
    columns: { id: true },
  });

  if (rows.length > limit) {
    const toDelete = rows.slice(limit).map((r) => r.id);
    for (const id of toDelete) {
      await db.delete(chatSnippets).where(eq(chatSnippets.id, id));
    }
  }
}

export async function getRecentChatSnippets(
  db: AppDatabase,
  chatId: number,
  limit = 5,
): Promise<Array<{ authorName: string; text: string }>> {
  const rows = await db.query.chatSnippets.findMany({
    where: eq(chatSnippets.chatId, chatId),
    orderBy: desc(chatSnippets.postedAt),
    limit,
  });

  return rows.reverse().map((r) => ({ authorName: r.authorName, text: r.text }));
}
