import { DateTime } from "luxon";
import type { CheckinStatus } from "../types.ts";

export interface StreakDay {
  date: string;
  status: CheckinStatus;
}

export function calculateStreak(history: StreakDay[], asOfDate: string): number {
  const byDate = new Map(history.map((d) => [d.date, d.status]));
  let streak = 0;
  let cursor = DateTime.fromISO(asOfDate).minus({ days: 1 });

  while (true) {
    const dateKey = cursor.toISODate();
    if (!dateKey) break;
    const status = byDate.get(dateKey);
    if (!status) break;
    if (status === "skipped") {
      cursor = cursor.minus({ days: 1 });
      continue;
    }
    if (status === "sober") {
      streak += 1;
      cursor = cursor.minus({ days: 1 });
      continue;
    }
    break;
  }

  return streak;
}

export function streakLabel(streak: number): string {
  if (streak === 0) return "streak reset";
  if (streak === 1) return "1 day streak";
  return `${streak} day streak`;
}
