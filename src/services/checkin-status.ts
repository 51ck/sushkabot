import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { checkins } from "../db/schema.ts";
import {
  type CheckinButtonKey,
  type CheckinStatus,
  normalizeCheckinStatus,
  resolveCheckinStatus,
} from "../types.ts";
import { calculateSoberStreak, type StreakDay } from "./streak.ts";

export async function getPreviousDayStatus(params: {
  db: AppDatabase;
  chatId: number;
  memberId: number;
  checkinDate: string;
}): Promise<CheckinStatus | null> {
  const { db, chatId, memberId, checkinDate } = params;
  const previousDate = DateTime.fromISO(checkinDate).minus({ days: 1 }).toISODate();
  if (!previousDate) return null;

  const row = await db.query.checkins.findFirst({
    where: and(
      eq(checkins.chatId, chatId),
      eq(checkins.memberId, memberId),
      eq(checkins.checkinDate, previousDate),
    ),
    orderBy: desc(checkins.id),
  });

  if (!row) return null;
  return normalizeCheckinStatus(row.status);
}

async function getMemberHistory(
  db: AppDatabase,
  chatId: number,
  memberId: number,
  asOfDate: string,
): Promise<StreakDay[]> {
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

async function getSoberStreakBeforeDate(params: {
  db: AppDatabase;
  chatId: number;
  memberId: number;
  checkinDate: string;
}): Promise<number> {
  const previousDate = DateTime.fromISO(params.checkinDate).minus({ days: 1 }).toISODate();
  if (!previousDate) return 0;
  const history = await getMemberHistory(params.db, params.chatId, params.memberId, previousDate);
  return calculateSoberStreak(history, previousDate);
}

export async function resolveMemberCheckinStatus(params: {
  db: AppDatabase;
  chatId: number;
  memberId: number;
  checkinDate: string;
  buttonKey: CheckinButtonKey;
  graceMinSoberDays: number;
}): Promise<CheckinStatus> {
  const { db, chatId, memberId, checkinDate, buttonKey, graceMinSoberDays } = params;

  if (buttonKey === "krasavchik") {
    return resolveCheckinStatus(buttonKey, null, 0, graceMinSoberDays);
  }

  const previousDayStatus = await getPreviousDayStatus({ db, chatId, memberId, checkinDate });
  const soberStreakBeforeToday = await getSoberStreakBeforeDate({
    db,
    chatId,
    memberId,
    checkinDate,
  });

  return resolveCheckinStatus(
    buttonKey,
    previousDayStatus,
    soberStreakBeforeToday,
    graceMinSoberDays,
  );
}

export async function resolveAbsentCheckinStatus(params: {
  db: AppDatabase;
  chatId: number;
  memberId: number;
  checkinDate: string;
  graceMinSoberDays: number;
}): Promise<CheckinStatus> {
  return resolveMemberCheckinStatus({
    ...params,
    buttonKey: "ostupilsya",
  });
}
