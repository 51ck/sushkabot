import { DateTime } from "luxon";
import type { CheckinStatus } from "../types.ts";
import { normalizeCheckinStatus } from "../types.ts";
import { calculateSoberStreak, type StreakDay } from "./streak.ts";

export type StreakQualityLabel = "solid" | "grace-heavy" | "mixed";

export interface StreakQuality {
  soberCurrent: number;
  graceDaysInWindow: number;
  calendarSpan: number;
  soberRatio14: number;
  quality: StreakQualityLabel;
  pattern: string;
}

const PATTERN_DAYS = 14;

function isSlip(status: CheckinStatus): boolean {
  return status === "minor_slip" || status === "major_slip";
}

function statusToPatternChar(status: CheckinStatus | undefined): string {
  if (!status) return "-";
  switch (status) {
    case "sober":
      return "K";
    case "minor_slip":
      return "m";
    case "major_slip":
      return "M";
  }
}

function buildStatusMap(history: StreakDay[]): Map<string, CheckinStatus> {
  const map = new Map<string, CheckinStatus>();
  for (const day of history) {
    map.set(day.date, normalizeCheckinStatus(day.status));
  }
  return map;
}

/** Compact last N days: oldest → newest. K/m/M/- */
export function buildCheckinPattern(
  history: StreakDay[],
  asOfDate: string,
  days = PATTERN_DAYS,
): string {
  const byDate = buildStatusMap(history);
  const chars: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = DateTime.fromISO(asOfDate).minus({ days: i }).toISODate();
    if (!date) {
      chars.push("-");
      continue;
    }
    chars.push(statusToPatternChar(byDate.get(date)));
  }
  return chars.join("");
}

function countGraceInSoberWalk(history: StreakDay[], asOfDate: string): number {
  const byDate = buildStatusMap(history);
  let grace = 0;
  let cursor: string | null = asOfDate;

  while (cursor) {
    const status = byDate.get(cursor);
    if (!status) break;

    if (status === "sober") {
      cursor = DateTime.fromISO(cursor).minus({ days: 1 }).toISODate();
      continue;
    }

    if (status === "major_slip") break;

    if (status === "minor_slip") {
      grace += 1;
      const prevDate = DateTime.fromISO(cursor).minus({ days: 1 }).toISODate();
      const prevStatus = prevDate ? byDate.get(prevDate) : undefined;
      if (prevStatus && isSlip(prevStatus)) break;
      cursor = prevDate;
      continue;
    }

    break;
  }

  return grace;
}

function calendarSpanForStreak(history: StreakDay[], asOfDate: string): number {
  const soberCurrent = calculateSoberStreak(history, asOfDate);
  if (soberCurrent === 0) return 0;

  const byDate = buildStatusMap(history);
  let span = 0;
  let countedSober = 0;
  let cursor: string | null = asOfDate;

  while (cursor && countedSober < soberCurrent) {
    const status = byDate.get(cursor);
    if (!status) break;
    span += 1;

    if (status === "sober") {
      countedSober += 1;
      cursor = DateTime.fromISO(cursor).minus({ days: 1 }).toISODate();
      continue;
    }

    if (status === "major_slip") break;

    if (status === "minor_slip") {
      const prevDate = DateTime.fromISO(cursor).minus({ days: 1 }).toISODate();
      const prevStatus = prevDate ? byDate.get(prevDate) : undefined;
      if (prevStatus && isSlip(prevStatus)) break;
      cursor = prevDate;
      continue;
    }

    break;
  }

  return span;
}

function soberRatioLastNDays(history: StreakDay[], asOfDate: string, days: number): number {
  const byDate = buildStatusMap(history);
  let sober = 0;
  let withCheckin = 0;

  for (let i = 0; i < days; i++) {
    const date = DateTime.fromISO(asOfDate).minus({ days: i }).toISODate();
    if (!date) continue;
    const status = byDate.get(date);
    if (!status) continue;
    withCheckin += 1;
    if (status === "sober") sober += 1;
  }

  if (withCheckin === 0) return 1;
  return sober / withCheckin;
}

export function computeStreakQuality(history: StreakDay[], asOfDate: string): StreakQuality {
  const soberCurrent = calculateSoberStreak(history, asOfDate);
  const graceDaysInWindow = countGraceInSoberWalk(history, asOfDate);
  const calendarSpan = calendarSpanForStreak(history, asOfDate);
  const soberRatio14 = soberRatioLastNDays(history, asOfDate, PATTERN_DAYS);
  const pattern = buildCheckinPattern(history, asOfDate, PATTERN_DAYS);

  let quality: StreakQualityLabel = "mixed";
  if (graceDaysInWindow === 0 && soberRatio14 >= 0.85) {
    quality = "solid";
  } else if (graceDaysInWindow >= 2 || soberRatio14 < 0.7) {
    quality = "grace-heavy";
  }

  return {
    soberCurrent,
    graceDaysInWindow,
    calendarSpan,
    soberRatio14,
    quality,
    pattern,
  };
}

export function isSolidMilestone(soberStreak: number, quality: StreakQualityLabel): boolean {
  return [7, 30, 90].includes(soberStreak) && quality === "solid";
}

export function formatQualityOneLiner(params: {
  mention: string;
  soberCurrent: number;
  soberMax: number;
  totalSoberDays: number;
  quality: StreakQuality;
}): string {
  const { mention, soberCurrent, soberMax, totalSoberDays, quality } = params;
  return (
    `${mention} sober=${soberCurrent}/max=${soberMax} total=${totalSoberDays} ` +
    `grace=${quality.graceDaysInWindow}/${quality.calendarSpan || "?"} ` +
    `pattern=${quality.pattern} quality=${quality.quality}`
  );
}
