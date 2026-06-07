import { and, desc, eq } from "drizzle-orm";
import type { Api } from "grammy";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chatMembers, checkins, type dailyWindows, members } from "../db/schema.ts";
import type { CheckinStatus } from "../types.ts";
import { statusToEmoji } from "../types.ts";
import { countAnswered, countJoinedMembers } from "./members.ts";
import { calculateStreak, streakLabel } from "./streak.ts";
import { buildSummaryMessage, formatMemberMention } from "./window-message.ts";

export async function postSummary(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  window: typeof dailyWindows.$inferSelect;
}): Promise<void> {
  const { db, api, chat, window } = params;

  if (window.status === "summarized") return;

  const joined = await db
    .select({
      memberId: chatMembers.memberId,
      username: members.username,
      displayName: members.displayName,
    })
    .from(chatMembers)
    .innerJoin(members, eq(chatMembers.memberId, members.id))
    .where(and(eq(chatMembers.chatId, chat.id), eq(chatMembers.active, true)));

  const windowCheckins = await db.query.checkins.findMany({
    where: eq(checkins.dailyWindowId, window.id),
  });
  const checkinByMember = new Map(windowCheckins.map((c) => [c.memberId, c]));

  const summaryLines: string[] = [];

  for (const member of joined) {
    const checkin = checkinByMember.get(member.memberId);
    const mention = formatMemberMention(member.username, member.displayName);

    if (!checkin) {
      summaryLines.push(`⏳ ${mention} — no answer`);
      continue;
    }

    const history = await getMemberCheckinHistory(db, chat.id, member.memberId, window.checkinDate);
    const streak = calculateStreak(history, window.checkinDate);
    const emoji = statusToEmoji(checkin.status as CheckinStatus);
    summaryLines.push(`${emoji} ${mention} — ${streakLabel(streak)}`);
  }

  const joinedCount = await countJoinedMembers(db, chat.id);
  const answeredCount = await countAnswered(db, window.id);

  const text = buildSummaryMessage({
    checkinDate: window.checkinDate,
    joinedCount,
    answeredCount,
    lines: summaryLines,
  });

  await api.sendMessage(Number(chat.telegramChatId), text);
}

async function getMemberCheckinHistory(
  db: AppDatabase,
  chatId: number,
  memberId: number,
  asOfDate: string,
): Promise<{ date: string; status: CheckinStatus }[]> {
  const rows = await db
    .select({
      checkinDate: checkins.checkinDate,
      status: checkins.status,
    })
    .from(checkins)
    .where(and(eq(checkins.chatId, chatId), eq(checkins.memberId, memberId)))
    .orderBy(desc(checkins.checkinDate))
    .limit(365);

  return rows
    .filter((r) => r.checkinDate <= asOfDate)
    .map((r) => ({ date: r.checkinDate, status: r.status as CheckinStatus }));
}

// Re-export streakLabel from streak - actually I imported from types by mistake
// streakLabel is in streak.ts
