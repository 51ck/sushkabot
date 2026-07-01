import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.ts";
import { chatMembers, members } from "../db/schema.ts";
import { buildMemberStats } from "./streak.ts";
import { getMemberCheckinHistory } from "./summary.ts";
import { formatMemberMention } from "./window-message.ts";

export interface MomentumEntry {
  mention: string;
  soberCurrent: number;
  soberMax: number;
  totalSoberDays: number;
  isComeback: boolean;
}

export async function buildGroupMomentum(
  db: AppDatabase,
  chatId: number,
  asOfDate: string,
): Promise<MomentumEntry[]> {
  const joined = await db
    .select({
      memberId: chatMembers.memberId,
      username: members.username,
      displayName: members.displayName,
    })
    .from(chatMembers)
    .innerJoin(members, eq(chatMembers.memberId, members.id))
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.active, true)));

  const entries: MomentumEntry[] = [];

  for (const member of joined) {
    const history = await getMemberCheckinHistory(db, chatId, member.memberId, asOfDate);
    const stats = buildMemberStats(history, asOfDate);

    entries.push({
      mention: formatMemberMention(member.username, member.displayName),
      soberCurrent: stats.soberCurrent,
      soberMax: stats.soberMax,
      totalSoberDays: stats.totalSoberDays,
      isComeback: stats.soberCurrent === 1 && stats.intoxCurrent === 0 && stats.totalSlipDays > 0,
    });
  }

  return entries;
}

export function formatMomentumBoard(entries: MomentumEntry[]): string {
  const streakers = entries
    .filter((e) => e.soberCurrent >= 7)
    .sort((a, b) => b.soberCurrent - a.soberCurrent);

  const accelerating = entries
    .filter((e) => e.soberCurrent >= 3 && e.soberCurrent < 7)
    .sort((a, b) => b.soberCurrent - a.soberCurrent);

  const comebacks = entries.filter((e) => e.isComeback);
  const totalGroupSober = entries.reduce((sum, e) => sum + e.totalSoberDays, 0);

  const lines: string[] = ["📊 Моментум группы", ""];

  if (streakers.length > 0) {
    lines.push("🔥 На серии:");
    for (const s of streakers) {
      const badge = s.soberCurrent >= 90 ? "👑" : s.soberCurrent >= 30 ? "⭐" : "💪";
      lines.push(`  ${badge} ${s.mention} — ${s.soberCurrent} дн.`);
    }
  } else {
    lines.push("Пока без длинных серий — всё впереди 💪");
  }

  if (accelerating.length > 0) {
    lines.push("");
    lines.push("🚀 Разгоняются:");
    for (const a of accelerating) {
      lines.push(`  ${a.mention} — ${a.soberCurrent} дн.`);
    }
  }

  if (comebacks.length > 0) {
    lines.push("");
    lines.push("🔄 Вернулись в строй:");
    for (const c of comebacks) {
      lines.push(`  ${c.mention} — день первый`);
    }
  }

  lines.push("");
  lines.push(`Всего трезвых дней в группе: ${totalGroupSober}`);

  return lines.join("\n");
}

export function formatMomentumForLlm(entries: MomentumEntry[]): string {
  const streakers = entries.filter((e) => e.soberCurrent >= 7);
  const accelerating = entries.filter((e) => e.soberCurrent >= 3 && e.soberCurrent < 7);
  const comebacks = entries.filter((e) => e.isComeback);
  const totalGroupSober = entries.reduce((sum, e) => sum + e.totalSoberDays, 0);

  const parts: string[] = [`total_group_sober_days: ${totalGroupSober}`];

  if (streakers.length > 0) {
    parts.push(
      `streaks_7plus: ${streakers.map((s) => `${s.mention}(${s.soberCurrent})`).join(", ")}`,
    );
  }
  if (accelerating.length > 0) {
    parts.push(
      `streaks_3to6: ${accelerating.map((a) => `${a.mention}(${a.soberCurrent})`).join(", ")}`,
    );
  }
  if (comebacks.length > 0) {
    parts.push(`comebacks: ${comebacks.map((c) => c.mention).join(", ")}`);
  }

  return parts.join("\n");
}
