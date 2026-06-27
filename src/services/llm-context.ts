import { and, eq } from "drizzle-orm";
import type { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import type { LlmGenerationKind } from "../db/schema.ts";
import { type Chat, chatMembers, members } from "../db/schema.ts";
import { env } from "../env.ts";
import { getRecentChatSnippets } from "./chat-snippets.ts";
import { formatChatBlockFromLines, trimSnippetForPrompt } from "./context-budget.ts";
import { getRecentLlmGenerations } from "./llm-generations.ts";
import { buildMemberStats } from "./streak.ts";
import {
  computeStreakQuality,
  formatQualityOneLiner,
  type StreakQuality,
} from "./streak-quality.ts";
import { getMemberCheckinHistory } from "./summary.ts";
import { formatCloseTime, formatMemberMention } from "./window-message.ts";

export interface ParticipantRosterEntry {
  mention: string;
  soberCurrent: number;
  soberMax: number;
  intoxCurrent: number;
  intoxMax: number;
  totalSoberDays: number;
  totalSlipDays: number;
  quality: StreakQuality;
}

export interface LlmStyleExample {
  kind: string;
  text: string;
}

export interface LlmChatSnippet {
  authorName: string;
  text: string;
}

export interface ChatScheduleContext {
  timezone: string;
  checkinOpens: string;
  windowCloses: string;
  windowDurationMinutes: number;
  nowLocal: string;
}

export interface LlmBaseContext {
  schedule: ChatScheduleContext;
  chatSnippets: LlmChatSnippet[];
  styleExamples: LlmStyleExample[];
  participants: ParticipantRosterEntry[];
}

export function buildChatScheduleContext(params: {
  chat: Chat;
  closesAt: DateTime;
  now?: DateTime;
}): ChatScheduleContext {
  const { chat, closesAt } = params;
  const now = (params.now ?? closesAt).setZone(chat.timezone);
  const checkinOpens = now.set({
    hour: chat.checkinHour,
    minute: chat.checkinMinute,
    second: 0,
    millisecond: 0,
  });

  return {
    timezone: chat.timezone,
    checkinOpens: checkinOpens.toFormat("HH:mm"),
    windowCloses: formatCloseTime(closesAt, chat.timezone),
    windowDurationMinutes: chat.windowDurationMinutes,
    nowLocal: now.toFormat("HH:mm"),
  };
}

export function formatScheduleBlock(schedule: ChatScheduleContext): string {
  return [
    `timezone: ${schedule.timezone}`,
    `checkin_opens: ${schedule.checkinOpens}`,
    `window_closes: ${schedule.windowCloses}`,
    `window_duration: ${schedule.windowDurationMinutes} min`,
    `now_local: ${schedule.nowLocal}`,
  ].join("\n");
}

export async function buildParticipantRosterStats(
  db: AppDatabase,
  chatId: number,
  asOfDate: string,
): Promise<ParticipantRosterEntry[]> {
  const joined = await db
    .select({
      memberId: chatMembers.memberId,
      username: members.username,
      displayName: members.displayName,
    })
    .from(chatMembers)
    .innerJoin(members, eq(chatMembers.memberId, members.id))
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.active, true)));

  const roster: ParticipantRosterEntry[] = [];
  for (const member of joined) {
    const history = await getMemberCheckinHistory(db, chatId, member.memberId, asOfDate);
    const stats = buildMemberStats(history, asOfDate);
    const quality = computeStreakQuality(history, asOfDate);
    roster.push({
      mention: formatMemberMention(member.username, member.displayName),
      soberCurrent: stats.soberCurrent,
      soberMax: stats.soberMax,
      intoxCurrent: stats.intoxCurrent,
      intoxMax: stats.intoxMax,
      totalSoberDays: stats.totalSoberDays,
      totalSlipDays: stats.totalSlipDays,
      quality,
    });
  }
  return roster;
}

export async function buildLlmBaseContext(params: {
  db: AppDatabase;
  chat: Chat;
  asOfDate: string;
  closesAt: DateTime;
  now?: DateTime;
  kind?: LlmGenerationKind;
}): Promise<LlmBaseContext> {
  const { db, chat, asOfDate, closesAt, kind } = params;
  const chatId = chat.id;

  const [chatSnippets, styleExamples, participants] = await Promise.all([
    getRecentChatSnippets(db, chatId, env.LLM_CHAT_CONTEXT_COUNT),
    getRecentLlmGenerations(db, chatId, { kind, limit: env.LLM_STYLE_EXAMPLES }),
    buildParticipantRosterStats(db, chatId, asOfDate),
  ]);

  return {
    schedule: buildChatScheduleContext({ chat, closesAt, now: params.now }),
    chatSnippets,
    styleExamples,
    participants,
  };
}

export function formatChatBlock(chatSnippets: LlmChatSnippet[]): string {
  const lines = chatSnippets.map((s) => `${s.authorName}: ${trimSnippetForPrompt(s.text)}`);
  return formatChatBlockFromLines(lines);
}

export function formatStyleBlock(styleExamples: LlmStyleExample[]): string {
  if (styleExamples.length === 0) return "(нет примеров)";
  return styleExamples.map((e) => `- [${e.kind}] ${e.text}`).join("\n");
}

export function formatRosterBlock(participants: ParticipantRosterEntry[]): string {
  if (participants.length === 0) return "(нет участников)";
  return participants
    .map((p) =>
      formatQualityOneLiner({
        mention: p.mention,
        soberCurrent: p.soberCurrent,
        soberMax: p.soberMax,
        totalSoberDays: p.totalSoberDays,
        quality: p.quality,
      }),
    )
    .join("\n");
}

/** Live kind: unanswered + notable streaks (≥7 or grace-heavy or near milestone). */
export function filterRosterForLive(
  participants: ParticipantRosterEntry[],
  answeredMentions: Set<string>,
): ParticipantRosterEntry[] {
  return participants.filter((p) => {
    if (!answeredMentions.has(p.mention)) return true;
    if (p.soberCurrent >= 7) return true;
    if (p.quality.quality === "grace-heavy") return true;
    return false;
  });
}

export function applyContextBudget<TSnippet, TRoster, TStyle>(params: {
  fixed: string;
  chatSnippets: TSnippet[];
  participants: TRoster[];
  styleExamples: TStyle[];
  formatSnippet: (s: TSnippet) => string;
  formatRoster: (p: TRoster) => string;
  formatStyle: (e: TStyle) => string;
}): {
  chatSnippets: TSnippet[];
  participants: TRoster[];
  styleExamples: TStyle[];
} {
  const chatSnippets = [...params.chatSnippets];
  const participants = [...params.participants];
  const styleExamples = [...params.styleExamples];

  const measure = () =>
    params.fixed.length +
    chatSnippets.map(params.formatSnippet).join("\n").length +
    participants.map(params.formatRoster).join("\n").length +
    styleExamples.map(params.formatStyle).join("\n").length;

  while (measure() > env.LLM_CONTEXT_MAX_CHARS) {
    if (styleExamples.length > 0) {
      styleExamples.pop();
      continue;
    }
    if (participants.length > 1) {
      participants.pop();
      continue;
    }
    if (chatSnippets.length > 3) {
      chatSnippets.shift();
      continue;
    }
    break;
  }

  return { chatSnippets, participants, styleExamples };
}

export function buildBasePromptSections(ctx: LlmBaseContext): string[] {
  return [
    "## Расписание",
    formatScheduleBlock(ctx.schedule),
    "",
    "## Примеры прошлых генераций",
    formatStyleBlock(ctx.styleExamples),
    "",
    "## Недавний чат",
    formatChatBlock(ctx.chatSnippets),
    "",
    "## Участники",
    formatRosterBlock(ctx.participants),
  ];
}
