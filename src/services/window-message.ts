import type { InlineKeyboard } from "grammy";
import { DateTime } from "luxon";
import { buildCheckinKeyboard } from "../bot/keyboards/checkin.ts";
import type { Chat } from "../db/schema.ts";
import { getButtonLabels, parseButtonLabels, type ResponseMode } from "../types.ts";

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
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
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
}): { text: string; replyMarkup: InlineKeyboard | undefined } {
  const { chat, checkinDate, answeredCount, joinedCount, closesAt, now, closed } = params;
  const mode = chat.responseMode as ResponseMode;
  const labels = getButtonLabels(mode, parseButtonLabels(chat.buttonLabels));
  const dateLabel = DateTime.fromISO(checkinDate).toFormat("MMM d");
  const closeLabel = formatCloseTime(closesAt, chat.timezone);
  const countdown = formatCountdown(closesAt, now);

  const lines = [`🌙 Evening check-in — ${dateLabel}`, "", chat.questionText];

  if (closed) {
    lines.push("", "Check-in closed.");
  } else {
    lines.push(`Answer before ${closeLabel} (${countdown})`, "");
    lines.push(`${answeredCount} of ${joinedCount} joined members answered`);
  }

  return {
    text: lines.join("\n"),
    replyMarkup: closed ? undefined : buildCheckinKeyboard(mode, labels),
  };
}

export function buildSummaryMessage(params: {
  checkinDate: string;
  joinedCount: number;
  answeredCount: number;
  lines: string[];
}): string {
  const dateLabel = DateTime.fromISO(params.checkinDate).toFormat("MMM d");
  return [
    `📊 ${dateLabel} summary`,
    "",
    `Answered: ${params.answeredCount}/${params.joinedCount} joined`,
    ...params.lines,
  ].join("\n");
}

export function formatMemberMention(username: string | null, displayName: string): string {
  if (username) return `@${username}`;
  return displayName;
}
