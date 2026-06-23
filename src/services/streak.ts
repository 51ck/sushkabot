import { DateTime } from "luxon";
import type { CheckinStatus } from "../types.ts";
import { normalizeCheckinStatus } from "../types.ts";

export interface StreakDay {
  date: string;
  status: CheckinStatus | string;
}

export interface StreakSnapshot {
  soberCurrent: number;
  soberMax: number;
  intoxCurrent: number;
  intoxMax: number;
  totalSoberDays: number;
  totalSlipDays: number;
}

export type HighlightEvent =
  | "routine"
  | "extended_sober"
  | "grace_minor"
  | "broke_sober"
  | "started_intox"
  | "extended_intox"
  | "milestone_7"
  | "milestone_30"
  | "milestone_90"
  | "comeback"
  | "fresh_start";

function buildStatusMap(history: StreakDay[]): Map<string, CheckinStatus> {
  const map = new Map<string, CheckinStatus>();
  for (const day of history) {
    map.set(day.date, normalizeCheckinStatus(day.status));
  }
  return map;
}

function isSlipStatus(status: CheckinStatus): boolean {
  return status === "minor_slip" || status === "major_slip";
}

function getStatus(byDate: Map<string, CheckinStatus>, date: string): CheckinStatus | undefined {
  return byDate.get(date);
}

function getPreviousDate(date: string): string | null {
  return DateTime.fromISO(date).minus({ days: 1 }).toISODate();
}

/** Walk backwards from asOfDate inclusive. */
export function calculateSoberStreak(history: StreakDay[], asOfDate: string): number {
  const byDate = buildStatusMap(history);
  let streak = 0;
  let cursor: string | null = asOfDate;

  while (cursor) {
    const status = getStatus(byDate, cursor);
    if (!status) break;

    if (status === "sober") {
      streak += 1;
      cursor = getPreviousDate(cursor);
      continue;
    }

    if (status === "major_slip") break;

    if (status === "minor_slip") {
      const prevDate = getPreviousDate(cursor);
      const prevStatus = prevDate ? getStatus(byDate, prevDate) : undefined;
      if (prevStatus && isSlipStatus(prevStatus)) break;
      cursor = prevDate;
      continue;
    }

    break;
  }

  return streak;
}

/** Walk backwards from asOfDate inclusive counting consecutive slip days. */
export function calculateIntoxStreak(history: StreakDay[], asOfDate: string): number {
  const byDate = buildStatusMap(history);
  let streak = 0;
  let cursor: string | null = asOfDate;

  while (cursor) {
    const status = getStatus(byDate, cursor);
    if (!status || !isSlipStatus(status)) break;
    streak += 1;
    cursor = getPreviousDate(cursor);
  }

  return streak;
}

/** @deprecated Use calculateSoberStreak */
export function calculateStreak(history: StreakDay[], asOfDate: string): number {
  return calculateSoberStreak(history, asOfDate);
}

function scanMaxStreak(
  sortedDates: string[],
  byDate: Map<string, CheckinStatus>,
  mode: "sober" | "intox",
): number {
  let max = 0;
  let current = 0;

  for (const date of sortedDates) {
    const status = byDate.get(date);
    if (!status) {
      current = 0;
      continue;
    }

    if (mode === "intox") {
      if (isSlipStatus(status)) {
        current += 1;
        max = Math.max(max, current);
      } else {
        current = 0;
      }
      continue;
    }

    // sober max: simulate forward walk with grace rules
    if (status === "sober") {
      current += 1;
      max = Math.max(max, current);
    } else if (status === "major_slip") {
      current = 0;
    } else if (status === "minor_slip") {
      const prevDate = getPreviousDate(date);
      const prevStatus = prevDate ? byDate.get(prevDate) : undefined;
      if (prevStatus && isSlipStatus(prevStatus)) {
        current = 0;
      }
      // grace: current unchanged
    }
  }

  return max;
}

export function calculateMaxStreaks(history: StreakDay[]): {
  soberMax: number;
  intoxMax: number;
} {
  const byDate = buildStatusMap(history);
  const sortedDates = [...byDate.keys()].sort();
  return {
    soberMax: scanMaxStreak(sortedDates, byDate, "sober"),
    intoxMax: scanMaxStreak(sortedDates, byDate, "intox"),
  };
}

export function buildMemberStats(history: StreakDay[], asOfDate: string): StreakSnapshot {
  const byDate = buildStatusMap(history);
  let totalSoberDays = 0;
  let totalSlipDays = 0;

  for (const [date, status] of byDate) {
    if (date > asOfDate) continue;
    if (status === "sober") totalSoberDays += 1;
    else if (isSlipStatus(status)) totalSlipDays += 1;
  }

  const { soberMax, intoxMax } = calculateMaxStreaks(history.filter((d) => d.date <= asOfDate));

  return {
    soberCurrent: calculateSoberStreak(history, asOfDate),
    soberMax,
    intoxCurrent: calculateIntoxStreak(history, asOfDate),
    intoxMax,
    totalSoberDays,
    totalSlipDays,
  };
}

export function detectTodayEvent(
  todayStatus: CheckinStatus,
  history: StreakDay[],
  asOfDate: string,
): HighlightEvent {
  const historyBefore = history.filter((d) => d.date < asOfDate);
  const soberBefore = calculateSoberStreak(historyBefore, getPreviousDate(asOfDate) ?? asOfDate);
  const intoxBefore = calculateIntoxStreak(historyBefore, getPreviousDate(asOfDate) ?? asOfDate);
  const soberAfter = calculateSoberStreak(
    [...historyBefore, { date: asOfDate, status: todayStatus }],
    asOfDate,
  );
  const intoxAfter = calculateIntoxStreak(
    [...historyBefore, { date: asOfDate, status: todayStatus }],
    asOfDate,
  );

  if (todayStatus === "sober") {
    if ([7, 30, 90].includes(soberAfter)) {
      if (soberAfter === 7) return "milestone_7";
      if (soberAfter === 30) return "milestone_30";
      if (soberAfter === 90) return "milestone_90";
    }
    if (intoxBefore >= 2) return "comeback";
    if (soberAfter === 1 && historyBefore.length === 0) return "fresh_start";
    if (soberAfter === 1 && intoxBefore === 1) return "fresh_start";
    if (soberAfter > soberBefore) return "extended_sober";
    return "routine";
  }

  if (todayStatus === "minor_slip") {
    if (soberAfter === soberBefore && soberBefore > 0) return "grace_minor";
    if (soberAfter < soberBefore) return "broke_sober";
    if (intoxAfter === 1 && intoxBefore === 0) return "started_intox";
    if (intoxAfter > intoxBefore) return "extended_intox";
    return "routine";
  }

  // major_slip
  if (soberBefore > 0) return "broke_sober";
  if (intoxAfter === 1) return "started_intox";
  if (intoxAfter > 1) return "extended_intox";
  return "routine";
}

export function streakLabel(streak: number): string {
  if (streak === 0) return "серия сброшена";
  if (streak === 1) return "1 день";
  if (streak >= 2 && streak <= 4) return `${streak} дня`;
  return `${streak} дней`;
}

export function soberStreakLabel(streak: number): string {
  if (streak === 0) return "трезвость: серия сброшена";
  return `трезвость: ${streakLabel(streak)}`;
}

export function intoxStreakLabel(streak: number): string {
  if (streak === 0) return "срыв: нет серии";
  return `срыв: ${streakLabel(streak)}`;
}

export function formatDualStreak(sober: number, intox: number): string {
  return `${soberStreakLabel(sober)}, ${intoxStreakLabel(intox)}`;
}
