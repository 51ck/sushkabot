import { eq } from "drizzle-orm";
import type { Api } from "grammy";
import type { AppDatabase } from "../db/client.ts";
import type { Chat, DailyWindow } from "../db/schema.ts";
import { checkins } from "../db/schema.ts";
import { normalizeCheckinStatus } from "../types.ts";
import { calculateSoberStreak } from "./streak.ts";
import { getMemberCheckinHistory } from "./summary.ts";
import { formatMemberMention } from "./window-message.ts";

const MILESTONES = [7, 14, 30, 60, 90] as const;

interface MilestoneMember {
  mention: string;
  milestone: number;
}

export async function detectWindowMilestones(params: {
  db: AppDatabase;
  chatId: number;
  window: DailyWindow;
}): Promise<MilestoneMember[]> {
  const { db, chatId, window } = params;

  const windowCheckins = await db.query.checkins.findMany({
    where: eq(checkins.dailyWindowId, window.id),
    with: { member: true },
  });

  const results: MilestoneMember[] = [];

  for (const checkin of windowCheckins) {
    const member = checkin.member;
    if (!member) continue;

    const status = normalizeCheckinStatus(checkin.status);
    if (status !== "sober") continue;

    const history = await getMemberCheckinHistory(db, chatId, member.id, window.checkinDate);
    const soberStreak = calculateSoberStreak(history, window.checkinDate);

    for (const m of MILESTONES) {
      if (soberStreak === m) {
        results.push({
          mention: formatMemberMention(member.username, member.displayName),
          milestone: m,
        });
        break;
      }
    }
  }

  return results;
}

const MILESTONE_FALLBACKS: Record<number, string> = {
  7: "Неделя трезвости — это уже привычка 💪",
  14: "Две недели — уже система 🧱",
  30: "Месяц. Это уже серьёзно 🔥",
  60: "Два месяца — это уже образ жизни 🔥",
  90: "90 дней — легенда 👑",
};

function buildMilestoneFallback(members: MilestoneMember[]): string {
  return members
    .map((m) => {
      const label = MILESTONE_FALLBACKS[m.milestone] ?? `${m.milestone} дней 💪`;
      return `🏆 ${m.mention} — ${label}`;
    })
    .join("\n");
}

export async function postMilestoneCelebrations(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  window: DailyWindow;
}): Promise<void> {
  const { db, api, chat, window } = params;

  const milestones = await detectWindowMilestones({ db, chatId: chat.id, window });
  if (milestones.length === 0) return;

  const text = buildMilestoneFallback(milestones);

  await api.sendMessage(Number(chat.telegramChatId), text);
}
