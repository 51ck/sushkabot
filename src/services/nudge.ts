import { and, eq } from "drizzle-orm";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chatMembers, checkins, type DailyWindow } from "../db/schema.ts";
import { trackBotPost } from "./bot-posts.ts";

const NUDGE_MESSAGES = [
  "Кнопки ждут. Не прячьтесь 👀",
  "Ещё не все отметились. Залетайте 👋",
  "Тишина подозрительная. Жмём кнопку 🫡",
  "Окно ещё открыто — успейте отметиться ⏳",
];

export async function sendNudge(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  window: DailyWindow;
}): Promise<void> {
  const { db, api, chat, window } = params;

  const joined = await db
    .select({ memberId: chatMembers.memberId })
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chat.id), eq(chatMembers.active, true)));

  const answered = await db
    .select({ memberId: checkins.memberId })
    .from(checkins)
    .where(eq(checkins.dailyWindowId, window.id));

  const answeredIds = new Set(answered.map((a) => a.memberId));
  const unanswered = joined.filter((j) => !answeredIds.has(j.memberId));

  if (unanswered.length === 0) return;

  const dayOfYear = DateTime.fromISO(window.checkinDate).ordinal ?? 0;
  const text = NUDGE_MESSAGES[dayOfYear % NUDGE_MESSAGES.length] ?? "Кнопки ждут 👀";

  const closesAt = DateTime.fromISO(window.windowClosesAt, { zone: "utc" });
  const deleteAfter = closesAt.plus({ minutes: 5 });

  const message = await api.sendMessage(Number(chat.telegramChatId), text);
  await trackBotPost({
    db,
    chatId: chat.id,
    telegramMessageId: message.message_id,
    kind: "command",
    dailyWindowId: window.id,
    deleteAfter,
  });
}
