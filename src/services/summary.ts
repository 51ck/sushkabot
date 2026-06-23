import { and, desc, eq } from "drizzle-orm";
import type { Api } from "grammy";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chatMembers, checkins, dailyWindows, members } from "../db/schema.ts";
import {
  type CheckinStatus,
  normalizeCheckinStatus,
  statusToEmoji,
  statusToLabel,
} from "../types.ts";
import { trackBotPost } from "./bot-posts.ts";
import { buildLlmBaseContext } from "./llm-context.ts";
import { generateSummaryIntro } from "./llm.ts";
import { recordLlmGeneration } from "./llm-generations.ts";
import { countAnswered, countJoinedMembers } from "./members.ts";
import { calculateIntoxStreak, calculateSoberStreak, formatDualStreak } from "./streak.ts";
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
  let soberCount = 0;
  let minorSlipCount = 0;
  let majorSlipCount = 0;

  for (const member of joined) {
    const checkin = checkinByMember.get(member.memberId);
    const mention = formatMemberMention(member.username, member.displayName);

    if (!checkin) {
      summaryLines.push(`⏳ ${mention} — нет данных`);
      continue;
    }

    const status = normalizeCheckinStatus(checkin.status);
    if (status === "sober") soberCount += 1;
    else if (status === "minor_slip") minorSlipCount += 1;
    else majorSlipCount += 1;

    const history = await getMemberCheckinHistory(db, chat.id, member.memberId, window.checkinDate);
    const sober = calculateSoberStreak(history, window.checkinDate);
    const intox = calculateIntoxStreak(history, window.checkinDate);
    const emoji = statusToEmoji(status);
    const label = statusToLabel(status);
    summaryLines.push(`${emoji} ${mention} — ${label}, ${formatDualStreak(sober, intox)}`);
  }

  const joinedCount = await countJoinedMembers(db, chat.id);
  const answeredCount = await countAnswered(db, window.id);

  let intro = window.generatedSummaryIntro;
  if (!intro) {
    const llmCtx = await buildLlmBaseContext(db, chat.id, window.checkinDate);
    intro = await generateSummaryIntro({
      ...llmCtx,
      date: window.checkinDate,
      answeredCount,
      joinedCount,
      soberCount,
      minorSlipCount,
      majorSlipCount,
    });
    if (intro) {
      await db
        .update(dailyWindows)
        .set({ generatedSummaryIntro: intro })
        .where(eq(dailyWindows.id, window.id));
      await recordLlmGeneration({ db, chatId: chat.id, kind: "summary", text: intro });
    }
  }

  const text = buildSummaryMessage({
    checkinDate: window.checkinDate,
    joinedCount,
    answeredCount,
    intro,
    lines: summaryLines,
  });

  const message = await api.sendMessage(Number(chat.telegramChatId), text);
  await trackBotPost({
    db,
    chatId: chat.id,
    telegramMessageId: message.message_id,
    kind: "summary",
    dailyWindowId: window.id,
  });
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
    .map((r) => ({ date: r.checkinDate, status: normalizeCheckinStatus(r.status) }));
}

export { getMemberCheckinHistory };
