import { and, eq } from "drizzle-orm";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, dailyWindows } from "../db/schema.ts";
import { trackBotPost } from "./bot-posts.ts";

const PLEDGE_MESSAGES = [
  "заявляет: сегодня красавчик 💪",
  "говорит: сегодня держусь 🫡",
  "на связи: сегодня без приключений 💪",
  "обещает: сегодня чисто 🔥",
];

const pledgedToday = new Map<string, Set<number>>();

function getPledgeKey(chatId: number, date: string): string {
  return `${chatId}:${date}`;
}

export function hasPledgedToday(chatId: number, memberId: number, date: string): boolean {
  const key = getPledgeKey(chatId, date);
  return pledgedToday.get(key)?.has(memberId) ?? false;
}

function markPledged(chatId: number, memberId: number, date: string): void {
  const key = getPledgeKey(chatId, date);
  if (!pledgedToday.has(key)) pledgedToday.set(key, new Set());
  pledgedToday.get(key)!.add(memberId);
}

export async function postPledge(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  memberId: number;
  mention: string;
  today: string;
}): Promise<{ alreadyPledged: boolean }> {
  const { db, api, chat, memberId, mention, today } = params;

  if (hasPledgedToday(chat.id, memberId, today)) {
    return { alreadyPledged: true };
  }

  markPledged(chat.id, memberId, today);

  const dayOfYear = DateTime.fromISO(today).ordinal ?? 0;
  const template = PLEDGE_MESSAGES[dayOfYear % PLEDGE_MESSAGES.length] ?? "заявляет: сегодня красавчик 💪";
  const text = `${mention} ${template}`;

  const window = await db.query.dailyWindows.findFirst({
    where: and(eq(dailyWindows.chatId, chat.id), eq(dailyWindows.checkinDate, today)),
  });

  const deleteAfter = window?.windowClosesAt
    ? DateTime.fromISO(window.windowClosesAt, { zone: "utc" }).plus({ minutes: 10 })
    : DateTime.utc().plus({ hours: 12 });

  const message = await api.sendMessage(Number(chat.telegramChatId), text);
  await trackBotPost({
    db,
    chatId: chat.id,
    telegramMessageId: message.message_id,
    kind: "command",
    dailyWindowId: window?.id ?? null,
    deleteAfter,
  });

  return { alreadyPledged: false };
}
