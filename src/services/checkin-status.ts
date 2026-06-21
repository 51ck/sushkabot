import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { checkins } from "../db/schema.ts";
import { type CheckinStatus, normalizeCheckinStatus } from "../types.ts";

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
