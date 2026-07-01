import { and, eq, gte } from "drizzle-orm";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chatMembers, checkins, members } from "../db/schema.ts";
import { normalizeCheckinStatus } from "../types.ts";
import { trackBotPost } from "./bot-posts.ts";
import { generateWeeklySummaryText } from "./llm.ts";
import { buildMemberStats } from "./streak.ts";
import { getMemberCheckinHistory } from "./summary.ts";
import { formatMemberMention } from "./window-message.ts";

export async function postWeeklySummary(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
}): Promise<void> {
  const { db, api, chat } = params;

  const now = DateTime.utc().setZone(chat.timezone);
  const today = now.toISODate() ?? now.toUTC().toISODate() ?? "";
  const weekAgo = now.minus({ days: 7 }).toISODate() ?? "";

  const fromDate = weekAgo;
  const toDate = now.minus({ days: 1 }).toISODate() ?? today;

  const joined = await db
    .select({
      memberId: chatMembers.memberId,
      username: members.username,
      displayName: members.displayName,
    })
    .from(chatMembers)
    .innerJoin(members, eq(chatMembers.memberId, members.id))
    .where(and(eq(chatMembers.chatId, chat.id), eq(chatMembers.active, true)));

  if (joined.length === 0) return;

  const weekCheckins = await db.query.checkins.findMany({
    where: and(eq(checkins.chatId, chat.id), gte(checkins.checkinDate, fromDate)),
  });

  const memberStats: Array<{
    mention: string;
    soberDays: number;
    slipDays: number;
    currentStreak: number;
  }> = [];

  let totalGroupSoberDays = 0;

  for (const member of joined) {
    const memberWeekCheckins = weekCheckins.filter((c) => c.memberId === member.memberId);
    const soberDays = memberWeekCheckins.filter(
      (c) => normalizeCheckinStatus(c.status) === "sober",
    ).length;
    const slipDays = memberWeekCheckins.length - soberDays;

    const history = await getMemberCheckinHistory(db, chat.id, member.memberId, today);
    const stats = buildMemberStats(history, today);

    memberStats.push({
      mention: formatMemberMention(member.username, member.displayName),
      soberDays,
      slipDays,
      currentStreak: stats.soberCurrent,
    });

    totalGroupSoberDays += soberDays;
  }

  const weekRange = `${fromDate} — ${toDate}`;
  const generated = await generateWeeklySummaryText({
    weekRange,
    memberStats,
    totalGroupSoberDays,
  });
  const fallback = "Неделя прошла. Продолжаем 💪";
  const body = generated ?? fallback;

  const text = `📅 Неделя ${fromDate} — ${toDate}\n\n${body}`;

  const message = await api.sendMessage(Number(chat.telegramChatId), text);
  await trackBotPost({
    db,
    chatId: chat.id,
    telegramMessageId: message.message_id,
    kind: "command",
  });
}
