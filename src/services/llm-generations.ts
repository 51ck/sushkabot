import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.ts";
import { type LlmGenerationKind, llmGenerations } from "../db/schema.ts";
import { env } from "../env.ts";

export async function recordLlmGeneration(params: {
  db: AppDatabase;
  chatId: number;
  kind: LlmGenerationKind;
  text: string;
}): Promise<void> {
  const { db, chatId, kind, text } = params;
  const trimmed = text.trim();
  if (!trimmed) return;

  await db.insert(llmGenerations).values({ chatId, kind, text: trimmed });

  const limit = env.LLM_STYLE_EXAMPLES;
  const rows = await db.query.llmGenerations.findMany({
    where: eq(llmGenerations.chatId, chatId),
    orderBy: desc(llmGenerations.id),
    columns: { id: true },
  });

  if (rows.length > limit * 3) {
    const toDelete = rows.slice(limit * 3).map((r) => r.id);
    for (const id of toDelete) {
      await db.delete(llmGenerations).where(eq(llmGenerations.id, id));
    }
  }
}

export async function getRecentLlmGenerations(
  db: AppDatabase,
  chatId: number,
  limit?: number,
): Promise<Array<{ kind: string; text: string }>> {
  const take = limit ?? env.LLM_STYLE_EXAMPLES;
  const rows = await db.query.llmGenerations.findMany({
    where: eq(llmGenerations.chatId, chatId),
    orderBy: desc(llmGenerations.createdAt),
    limit: take,
  });

  return rows.reverse().map((r) => ({ kind: r.kind, text: r.text }));
}
