import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { checkins } from "../db/schema.ts";
import { env } from "../env.ts";
import type { CheckinStatus } from "../types.ts";
import { normalizeCheckinStatus, statusToLabel } from "../types.ts";
import { getRecentChatSnippets } from "./chat-snippets.ts";
import { buildParticipantRosterStats, type ParticipantRosterEntry } from "./llm-context.ts";
import {
  type buildMemberStats,
  calculateIntoxStreak,
  calculateSoberStreak,
  detectTodayEvent,
  type HighlightEvent,
} from "./streak.ts";
import { formatMemberMention } from "./window-message.ts";

export interface MemberHighlight {
  mention: string;
  status: CheckinStatus;
  statusLabel: string;
  soberStreakBefore: number;
  intoxStreakBefore: number;
  soberStreakAfter: number;
  intoxStreakAfter: number;
  event: HighlightEvent;
}

export interface WindowHighlightContext {
  checkinDate: string;
  answeredCount: number;
  joinedCount: number;
  closesAt: string;
  mode: "full" | "highlights_only";
  highlights: MemberHighlight[];
  chatSnippets: Array<{ authorName: string; text: string }>;
  styleExamples: Array<{ kind: string; text: string }>;
  participants: ParticipantRosterEntry[];
}

async function getMemberHistory(
  db: AppDatabase,
  chatId: number,
  memberId: number,
  asOfDate: string,
): Promise<Array<{ date: string; status: CheckinStatus }>> {
  const rows = await db
    .select({ checkinDate: checkins.checkinDate, status: checkins.status })
    .from(checkins)
    .where(and(eq(checkins.chatId, chatId), eq(checkins.memberId, memberId)))
    .orderBy(desc(checkins.checkinDate))
    .limit(365);

  return rows
    .filter((r) => r.checkinDate <= asOfDate)
    .map((r) => ({ date: r.checkinDate, status: normalizeCheckinStatus(r.status) }));
}

export function highlightsHash(highlights: MemberHighlight[]): string {
  return highlights
    .map((h) => `${h.mention}:${h.status}:${h.event}:${h.soberStreakAfter}:${h.intoxStreakAfter}`)
    .join("|");
}

export async function buildWindowHighlightContext(params: {
  db: AppDatabase;
  chatId: number;
  windowId: number;
  checkinDate: string;
  answeredCount: number;
  joinedCount: number;
  closesAt: DateTime;
  styleExamples: Array<{ kind: string; text: string }>;
}): Promise<WindowHighlightContext> {
  const { db, chatId, windowId, checkinDate, answeredCount, joinedCount, closesAt, styleExamples } =
    params;

  const windowCheckins = await db.query.checkins.findMany({
    where: eq(checkins.dailyWindowId, windowId),
    with: { member: true },
  });

  const allHighlights: MemberHighlight[] = [];

  for (const checkin of windowCheckins) {
    const member = checkin.member;
    if (!member) continue;

    const status = normalizeCheckinStatus(checkin.status);
    const history = await getMemberHistory(db, chatId, checkin.memberId, checkinDate);
    const historyBefore = history.filter((d) => d.date < checkinDate);
    const prevDate = DateTime.fromISO(checkinDate).minus({ days: 1 }).toISODate() ?? checkinDate;

    const soberBefore = calculateSoberStreak(historyBefore, prevDate);
    const intoxBefore = calculateIntoxStreak(historyBefore, prevDate);
    const soberAfter = calculateSoberStreak(history, checkinDate);
    const intoxAfter = calculateIntoxStreak(history, checkinDate);
    const event = detectTodayEvent(status, historyBefore, checkinDate);

    allHighlights.push({
      mention: formatMemberMention(member.username, member.displayName),
      status,
      statusLabel: statusToLabel(status),
      soberStreakBefore: soberBefore,
      intoxStreakBefore: intoxBefore,
      soberStreakAfter: soberAfter,
      intoxStreakAfter: intoxAfter,
      event,
    });
  }

  const mode: WindowHighlightContext["mode"] =
    answeredCount <= env.HIGHLIGHT_FULL_LIST_MAX ? "full" : "highlights_only";

  const highlights =
    mode === "full"
      ? allHighlights
      : allHighlights.filter((h) => h.event !== "routine" && h.event !== "extended_sober");

  const chatSnippets = await getRecentChatSnippets(db, chatId, env.LLM_CHAT_CONTEXT_COUNT);
  const participants = await buildParticipantRosterStats(db, chatId, checkinDate);

  return {
    checkinDate,
    answeredCount,
    joinedCount,
    closesAt: closesAt.toISO() ?? closesAt.toUTC().toISO() ?? "",
    mode,
    highlights,
    chatSnippets,
    styleExamples,
    participants,
  };
}

/** Human-readable highlights for live-window LLM prompt. */
export function formatHighlightsBlock(highlights: MemberHighlight[]): string {
  if (highlights.length === 0) return "(пока никто не ответил)";

  return highlights
    .map((h) => {
      const streak =
        h.soberStreakBefore !== h.soberStreakAfter
          ? `трезвость ${h.soberStreakBefore}→${h.soberStreakAfter}`
          : `трезвость ${h.soberStreakAfter}`;
      const intox = h.intoxStreakAfter > 0 ? `, срыв ${h.intoxStreakAfter}` : "";
      return `- ${h.mention}: ${h.statusLabel}, ${streak}${intox}, event=${h.event}`;
    })
    .join("\n");
}

export function buildStatsPayload(params: {
  mention: string;
  checkinDate: string;
  stats: ReturnType<typeof buildMemberStats>;
  recentDays: Array<{ date: string; status: CheckinStatus }>;
}): Record<string, unknown> {
  return {
    mention: params.mention,
    asOfDate: params.checkinDate,
    soberCurrent: params.stats.soberCurrent,
    soberMax: params.stats.soberMax,
    intoxCurrent: params.stats.intoxCurrent,
    intoxMax: params.stats.intoxMax,
    totalSoberDays: params.stats.totalSoberDays,
    totalSlipDays: params.stats.totalSlipDays,
    recentDays: params.recentDays.map((d) => ({
      date: d.date,
      status: statusToLabel(d.status),
    })),
  };
}
