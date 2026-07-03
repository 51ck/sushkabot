import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { Chat } from "../db/schema.ts";

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

export function cleanupOldPledges(currentDate: string): void {
  for (const key of pledgedToday.keys()) {
    const keyDate = key.split(":")[1];
    if (keyDate && keyDate < currentDate) pledgedToday.delete(key);
  }
}

export function hasPledgedToday(chatId: number, memberId: number, date: string): boolean {
  const key = getPledgeKey(chatId, date);
  return pledgedToday.get(key)?.has(memberId) ?? false;
}

function markPledged(chatId: number, memberId: number, date: string): void {
  const key = getPledgeKey(chatId, date);
  if (!pledgedToday.has(key)) pledgedToday.set(key, new Set());
  pledgedToday.get(key)?.add(memberId);
}

export async function postPledge(params: {
  api: Api;
  chat: Chat;
  memberId: number;
  mention: string;
  today: string;
}): Promise<{ alreadyPledged: boolean }> {
  const { api, chat, memberId, mention, today } = params;

  if (hasPledgedToday(chat.id, memberId, today)) {
    return { alreadyPledged: true };
  }

  markPledged(chat.id, memberId, today);

  const dayOfYear = DateTime.fromISO(today).ordinal ?? 0;
  const template =
    PLEDGE_MESSAGES[dayOfYear % PLEDGE_MESSAGES.length] ?? "заявляет: сегодня красавчик 💪";
  const text = `${mention} ${template}`;

  await api.sendMessage(Number(chat.telegramChatId), text);

  return { alreadyPledged: false };
}
