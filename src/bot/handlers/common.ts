import { and, desc, eq } from "drizzle-orm";
import type { Bot } from "grammy";
import { DateTime } from "luxon";
import { checkins, dailyWindows } from "../../db/schema.ts";
import {
  countAnswered,
  countJoinedMembers,
  ensureMember,
  getChatByTelegramId,
  joinChatMember,
  leaveChatMember,
} from "../../services/members.ts";
import { calculateStreak, streakLabel } from "../../services/streak.ts";
import { texts } from "../../texts.ts";
import type { CheckinStatus } from "../../types.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat } from "../context.ts";

export function registerCommonHandlers(bot: Bot<BotContext>): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(texts.help);
  });

  bot.command("join", async (ctx) => {
    if (!isGroupChat(ctx) || !ctx.from) {
      await ctx.reply(texts.notGroup);
      return;
    }

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) {
      await ctx.reply(texts.notConfigured);
      return;
    }

    const { memberId } = await ensureMember(ctx.db, ctx.from);
    const existing = await ctx.db.query.chatMembers.findFirst({
      where: (cm, { and, eq }) =>
        and(eq(cm.chatId, chat.id), eq(cm.memberId, memberId), eq(cm.active, true)),
    });

    if (existing) {
      await ctx.reply(texts.alreadyJoined);
      return;
    }

    await joinChatMember(ctx.db, chat.id, memberId);
    await ctx.reply(texts.joinSuccess);
  });

  bot.command("leave", async (ctx) => {
    if (!isGroupChat(ctx) || !ctx.from) {
      await ctx.reply(texts.notGroup);
      return;
    }

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) {
      await ctx.reply(texts.notConfigured);
      return;
    }

    const { memberId } = await ensureMember(ctx.db, ctx.from);
    const existing = await ctx.db.query.chatMembers.findFirst({
      where: (cm, { and, eq }) =>
        and(eq(cm.chatId, chat.id), eq(cm.memberId, memberId), eq(cm.active, true)),
    });

    if (!existing) {
      await ctx.reply(texts.notJoined);
      return;
    }

    await leaveChatMember(ctx.db, chat.id, memberId);
    await ctx.reply(texts.leaveSuccess);
  });

  bot.command("status", async (ctx) => {
    if (!ctx.from) return;

    let telegramChatId: string | null = null;
    if (isGroupChat(ctx) && ctx.chat) {
      telegramChatId = String(ctx.chat.id);
    } else if (ctx.chat?.type === "private") {
      await ctx.reply("Use /status in your group chat, or join a group with the bot first.");
      return;
    }

    if (!telegramChatId) return;

    const chat = await getChatByTelegramId(ctx.db, telegramChatId);
    if (!chat) {
      await ctx.reply(texts.notConfigured);
      return;
    }

    const today = DateTime.now().setZone(chat.timezone).toISODate() ?? "";
    const window = await ctx.db.query.dailyWindows.findFirst({
      where: and(eq(dailyWindows.chatId, chat.id), eq(dailyWindows.checkinDate, today)),
      orderBy: desc(dailyWindows.id),
    });

    const joinedCount = await countJoinedMembers(ctx.db, chat.id);
    const answeredCount = window ? await countAnswered(ctx.db, window.id) : 0;

    const { memberId } = await ensureMember(ctx.db, ctx.from);
    const history = await ctx.db
      .select({ checkinDate: checkins.checkinDate, status: checkins.status })
      .from(checkins)
      .where(and(eq(checkins.chatId, chat.id), eq(checkins.memberId, memberId)))
      .orderBy(desc(checkins.checkinDate))
      .limit(365);

    const streak = calculateStreak(
      history.map((h) => ({ date: h.checkinDate, status: h.status as CheckinStatus })),
      today,
    );

    const windowState = window?.status ?? "none";
    await ctx.reply(
      [
        `Window: ${windowState}`,
        window
          ? `Progress: ${answeredCount}/${joinedCount} joined answered`
          : "No window today yet.",
        `Your streak: ${streakLabel(streak)}`,
      ].join("\n"),
    );
  });
}
