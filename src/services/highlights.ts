import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import type { Chat } from "../db/schema.ts";
import { checkins } from "../db/schema.ts";
import { env } from "../env.ts";
import type { CheckinStatus } from "../types.ts";
import { normalizeCheckinStatus, statusToLabel } from "../types.ts";
import { buildLlmBaseContext, filterRosterForLive, type LlmBaseContext } from "./llm-context.ts";
import {
  type buildMemberStats,
  calculateIntoxStreak,
  calculateMaxStreaks,
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
  soberMax: number;
  totalSoberDays: number;
  event: HighlightEvent;
  nearMilestone: number | null;
}

export interface WindowHighlightContext extends LlmBaseContext {
  checkinDate: string;
  answeredCount: number;
  joinedCount: number;
  mode: "full" | "highlights_only";
  highlights: MemberHighlight[];
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

const MILESTONES = [7, 30, 90];
const NEAR_MILESTONE_THRESHOLD = 3;

function findNearMilestone(soberStreak: number): number | null {
  for (const m of MILESTONES) {
    const remaining = m - soberStreak;
    if (remaining > 0 && remaining <= NEAR_MILESTONE_THRESHOLD) return m;
  }
  return null;
}

export function highlightsHash(highlights: MemberHighlight[]): string {
  return highlights
    .map((h) => `${h.mention}:${h.status}:${h.event}:${h.soberStreakAfter}:${h.intoxStreakAfter}`)
    .join("|");
}

export async function buildWindowHighlightContext(params: {
  db: AppDatabase;
  chat: Chat;
  windowId: number;
  checkinDate: string;
  answeredCount: number;
  joinedCount: number;
  closesAt: DateTime;
}): Promise<WindowHighlightContext> {
  const { db, chat, windowId, checkinDate, answeredCount, joinedCount, closesAt } = params;

  const baseCtx = await buildLlmBaseContext({
    db,
    chat,
    asOfDate: checkinDate,
    closesAt,
    kind: "live",
  });

  const windowCheckins = await db.query.checkins.findMany({
    where: eq(checkins.dailyWindowId, windowId),
    with: { member: true },
  });

  const allHighlights: MemberHighlight[] = [];

  for (const checkin of windowCheckins) {
    const member = checkin.member;
    if (!member) continue;

    const status = normalizeCheckinStatus(checkin.status);
    const history = await getMemberHistory(db, chat.id, checkin.memberId, checkinDate);
    const historyBefore = history.filter((d) => d.date < checkinDate);
    const prevDate = DateTime.fromISO(checkinDate).minus({ days: 1 }).toISODate() ?? checkinDate;

    const soberBefore = calculateSoberStreak(historyBefore, prevDate);
    const intoxBefore = calculateIntoxStreak(historyBefore, prevDate);
    const soberAfter = calculateSoberStreak(history, checkinDate);
    const intoxAfter = calculateIntoxStreak(history, checkinDate);
    const event = detectTodayEvent(status, historyBefore, checkinDate);
    const { soberMax } = calculateMaxStreaks(history.filter((d) => d.date <= checkinDate));
    const totalSoberDays = history.filter(
      (d) => d.date <= checkinDate && normalizeCheckinStatus(d.status) === "sober",
    ).length;

    allHighlights.push({
      mention: formatMemberMention(member.username, member.displayName),
      status,
      statusLabel: statusToLabel(status),
      soberStreakBefore: soberBefore,
      intoxStreakBefore: intoxBefore,
      soberStreakAfter: soberAfter,
      intoxStreakAfter: intoxAfter,
      soberMax,
      totalSoberDays,
      event,
      nearMilestone: findNearMilestone(soberAfter),
    });
  }

  const mode: WindowHighlightContext["mode"] =
    answeredCount <= env.HIGHLIGHT_FULL_LIST_MAX ? "full" : "highlights_only";

  const highlights =
    mode === "full"
      ? allHighlights
      : allHighlights.filter((h) => h.event !== "routine" && h.event !== "extended_sober");

  const answeredMentions = new Set(allHighlights.map((h) => h.mention));
  const participants = filterRosterForLive(baseCtx.participants, answeredMentions);

  return {
    ...baseCtx,
    participants,
    checkinDate,
    answeredCount,
    joinedCount,
    mode,
    highlights,
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
      const cumulative = `, всего_трезвых=${h.totalSoberDays}, рекорд=${h.soberMax}`;
      const near = h.nearMilestone
        ? `, near_milestone=${h.nearMilestone} (ещё ${h.nearMilestone - h.soberStreakAfter})`
        : "";
      return `- ${h.mention}: ${h.statusLabel}, ${streak}${intox}${cumulative}${near}, event=${h.event}`;
    })
    .join("\n");
}

export interface StatsPromptPayload {
  mention: string;
  asOfDate: string;
  soberCurrent: number;
  soberMax: number;
  intoxCurrent: number;
  intoxMax: number;
  totalSoberDays: number;
  totalSlipDays: number;
  pattern: string;
  quality: string;
  recentDays: Array<{ date: string; status: string }>;
}

export function buildStatsPayload(params: {
  mention: string;
  checkinDate: string;
  stats: ReturnType<typeof buildMemberStats>;
  recentDays: Array<{ date: string; status: CheckinStatus }>;
  pattern: string;
  quality: string;
}): StatsPromptPayload {
  return {
    mention: params.mention,
    asOfDate: params.checkinDate,
    soberCurrent: params.stats.soberCurrent,
    soberMax: params.stats.soberMax,
    intoxCurrent: params.stats.intoxCurrent,
    intoxMax: params.stats.intoxMax,
    totalSoberDays: params.stats.totalSoberDays,
    totalSlipDays: params.stats.totalSlipDays,
    pattern: params.pattern,
    quality: params.quality,
    recentDays: params.recentDays.map((d) => ({
      date: d.date,
      status: statusToLabel(d.status),
    })),
  };
}

/** Human-readable personal stats for /stats LLM prompt. */
export function formatStatsBlock(payload: StatsPromptPayload): string {
  const recent =
    payload.recentDays.length === 0
      ? "(нет отметок за 14 дней)"
      : payload.recentDays.map((d) => `- ${d.date}: ${d.status}`).join("\n");

  const nearMilestone = findNearMilestone(payload.soberCurrent);
  const nearLine = nearMilestone
    ? `До следующего майлстоуна (${nearMilestone}): ${nearMilestone - payload.soberCurrent} дн.`
    : null;

  return [
    `Участник: ${payload.mention}`,
    `На дату: ${payload.asOfDate}`,
    `Всего: ${payload.totalSoberDays} трезвых / ${payload.totalSlipDays} срывных дней`,
    `Рекорд серии трезвости: ${payload.soberMax}`,
    `Текущий стрик трезвости: ${payload.soberCurrent}`,
    `Стрик срыва: ${payload.intoxCurrent} (макс ${payload.intoxMax})`,
    `pattern: ${payload.pattern}`,
    `quality: ${payload.quality}`,
    ...(nearLine ? [nearLine] : []),
    "Последние 14 дней:",
    recent,
  ].join("\n");
}
