import type { Bot } from "grammy";
import { DateTime } from "luxon";
import { env } from "../../env.ts";
import { trackBotPost } from "../../services/bot-posts.ts";
import { buildStatsPayload } from "../../services/highlights.ts";
import { formatStatsFallback, generatePersonalStats } from "../../services/llm.ts";
import { recordLlmGeneration } from "../../services/llm-generations.ts";
import { ensureMember, getChatByTelegramId } from "../../services/members.ts";
import { buildMemberStats } from "../../services/streak.ts";
import { getMemberCheckinHistory } from "../../services/summary.ts";
import { formatMemberMention } from "../../services/window-message.ts";
import { texts } from "../../texts.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat } from "../context.ts";

export function registerCommonHandlers(bot: Bot<BotContext>): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(texts.help);
  });

  bot.command("stats", async (ctx) => {
    if (!isGroupChat(ctx) || !ctx.from || !ctx.chat) {
      await ctx.reply(texts.notGroup);
      return;
    }

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) {
      await ctx.reply(texts.notConfigured);
      return;
    }

    const today = DateTime.now().setZone(chat.timezone).toISODate() ?? "";
    const { memberId } = await ensureMember(ctx.db, ctx.from);

    const member = await ctx.db.query.members.findFirst({
      where: (m, { eq }) => eq(m.id, memberId),
    });
    if (!member) return;

    const history = await getMemberCheckinHistory(ctx.db, chat.id, memberId, today);
    const stats = buildMemberStats(history, today);
    const weekStart = DateTime.fromISO(today).minus({ days: 7 }).toISODate() ?? today;
    const recentDays = history
      .filter((d) => d.date >= weekStart)
      .sort((a, b) => a.date.localeCompare(b.date));

    const mention = formatMemberMention(member.username, member.displayName);
    const payload = buildStatsPayload({ mention, checkinDate: today, stats, recentDays });

    const llmText = await generatePersonalStats(payload);
    const text = llmText ?? formatStatsFallback(payload);

    if (llmText) {
      await recordLlmGeneration({ db: ctx.db, chatId: chat.id, kind: "stats", text: llmText });
    }

    const message = await ctx.reply(text);
    await trackBotPost({
      db: ctx.db,
      chatId: chat.id,
      telegramMessageId: message.message_id,
      kind: "stats",
      deleteAfter: DateTime.utc().plus({ minutes: env.STATS_TTL_MINUTES }),
    });
  });

  bot.command("status", async (ctx) => {
    await ctx.reply("Используй /stats — там полная статистика.");
  });
}
