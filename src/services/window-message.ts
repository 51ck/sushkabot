import type { InlineKeyboard } from "grammy";
import { DateTime } from "luxon";
import { buildCheckinKeyboard } from "../bot/keyboards/checkin.ts";
import type { Chat } from "../db/schema.ts";
import { DEFAULT_QUESTION } from "../types.ts";

export function computeWindowClose(openAt: DateTime, durationMinutes: number): DateTime {
  return openAt.plus({ minutes: durationMinutes });
}

export function computeCheckinDate(openAt: DateTime): string {
  return openAt.toISODate() ?? openAt.toFormat("yyyy-MM-dd");
}

export function formatCountdown(closesAt: DateTime, now: DateTime): string {
  const diff = closesAt.diff(now, ["hours", "minutes"]).toObject();
  const hours = Math.max(0, Math.floor(diff.hours ?? 0));
  const minutes = Math.max(0, Math.floor(diff.minutes ?? 0));
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

export function formatCloseTime(closesAt: DateTime, timezone: string): string {
  return closesAt.setZone(timezone).toFormat("HH:mm");
}

/** Strip template chrome if LLM echoed header/footer. */
export function sanitizeWindowBody(text: string): string {
  let body = text.trim();
  body = body.replace(/^🌙\s*Сушка\s*·[^\n]*\n*/m, "");
  body = body.replace(/^⏱[^\n]*ответили\s*\n*/im, "");
  body = body.replace(/\n*Окно закрыто\.?\s*$/im, "");
  return body.trim();
}

export function buildWindowMessage(params: {
  chat: Chat;
  checkinDate: string;
  answeredCount: number;
  joinedCount: number;
  closesAt: DateTime;
  closed?: boolean;
  generatedBody?: string | null;
}): { text: string; replyMarkup: InlineKeyboard | undefined } {
  const { chat, answeredCount, joinedCount, closesAt, closed, generatedBody } = params;
  const closeLabel = formatCloseTime(closesAt, chat.timezone);
  const rawBody = generatedBody?.trim() || chat.questionText?.trim() || DEFAULT_QUESTION;
  const body = sanitizeWindowBody(rawBody) || DEFAULT_QUESTION;

  const lines = [body];

  if (closed) {
    lines.push("", "Окно закрыто.");
  } else {
    lines.push("", `⏱ до ${closeLabel} · ${answeredCount}/${joinedCount} ответили`);
  }

  return {
    text: lines.join("\n"),
    replyMarkup: closed ? undefined : buildCheckinKeyboard(),
  };
}

const SUMMARY_FALLBACKS = [
  "Ещё один день позади — вы справились 💪",
  "Вечер закрыт. Завтра продолжаем 🫡",
  "День пройден. Красавчики на связи 💪",
  "Окно закрыто. Отдыхайте, завтра снова 🫡",
];

export function buildSummaryMessage(params: {
  checkinDate: string;
  intro?: string | null;
}): string {
  if (params.intro?.trim()) return params.intro.trim();
  const dateLabel = DateTime.fromISO(params.checkinDate).setLocale("ru").toFormat("d MMMM");
  const dayOfYear = DateTime.fromISO(params.checkinDate).ordinal ?? 0;
  const fallback = SUMMARY_FALLBACKS[dayOfYear % SUMMARY_FALLBACKS.length];
  return `📊 ${dateLabel} · ${fallback}`;
}

export function formatMemberMention(username: string | null, displayName: string): string {
  if (username) return `@${username}`;
  return displayName;
}
