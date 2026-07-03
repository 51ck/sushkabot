import type { Bot } from "grammy";
import { ensureMember, getChatByTelegramId } from "../../services/members.ts";
import { deactivateRosterMember } from "../../services/roster-lifecycle.ts";
import { buildRulesText } from "../../services/rules.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat } from "../context.ts";

export function registerWelcomeHandlers(bot: Bot<BotContext>): void {
  bot.command("rules", async (ctx) => {
    if (!ctx.chat) return;

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    const timeStr = chat
      ? `${chat.checkinHour}:${String(chat.checkinMinute).padStart(2, "0")}`
      : undefined;

    await ctx.reply(buildRulesText(timeStr, chat?.graceMinSoberDays));
  });

  bot.on("message:new_chat_members", async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    const nonBotMembers = newMembers.filter((m) => !m.is_bot);
    if (nonBotMembers.length === 0) return;

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    const timeStr = chat
      ? `${chat.checkinHour}:${String(chat.checkinMinute).padStart(2, "0")}`
      : undefined;

    for (const member of nonBotMembers) {
      const mention = member.username ? `@${member.username}` : member.first_name;
      const text = `${mention}, привет! 👋\n\n${buildRulesText(timeStr, chat?.graceMinSoberDays)}`;
      await ctx.reply(text);
    }
  });

  bot.on("message:left_chat_member", async (ctx) => {
    const left = ctx.message.left_chat_member;
    if (!left || left.is_bot || !ctx.chat || !isGroupChat(ctx)) return;

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) return;

    const { memberId } = await ensureMember(ctx.db, left);
    await deactivateRosterMember({
      db: ctx.db,
      api: ctx.api,
      chat,
      memberId,
      scheduler: ctx.scheduler,
    });
  });
}
