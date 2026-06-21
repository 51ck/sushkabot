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

export function buildWindowMessage(params: {
  chat: Chat;
  checkinDate: string;
  answeredCount: number;
  joinedCount: number;
  closesAt: DateTime;
  now: DateTime;
  closed?: boolean;
  generatedBody?: string | null;
}): { text: string; replyMarkup: InlineKeyboard | undefined } {
  const { chat, checkinDate, answeredCount, joinedCount, closesAt, now, closed, generatedBody } =
    params;
  const dateLabel = DateTime.fromISO(checkinDate).setLocale("ru").toFormat("d MMMM");
  const closeLabel = formatCloseTime(closesAt, chat.timezone);
  const countdown = formatCountdown(closesAt, now);
  const body = generatedBody?.trim() || chat.questionText?.trim() || DEFAULT_QUESTION;

  const lines = [`🌙 Сушка · ${dateLabel}`, "", body];

  if (closed) {
    lines.push("", "Окно закрыто.");
  } else {
    lines.push("", `⏱ до ${closeLabel} (${countdown}) · ${answeredCount}/${joinedCount} ответили`);
  }

  return {
    text: lines.join("\n"),
    replyMarkup: closed ? undefined : buildCheckinKeyboard(),
  };
}

export function buildSummaryMessage(params: {
  checkinDate: string;
  joinedCount: number;
  answeredCount: number;
  intro?: string | null;
  lines: string[];
}): string {
  const dateLabel = DateTime.fromISO(params.checkinDate).setLocale("ru").toFormat("d MMMM");
  const header = params.intro?.trim() || `📊 Итоги · ${dateLabel}`;
  return [
    header,
    "",
    `Ответили: ${params.answeredCount}/${params.joinedCount}`,
    ...params.lines,
  ].join("\n");
}

export function formatMemberMention(username: string | null, displayName: string): string {
  if (username) return `@${username}`;
  return displayName;
}
