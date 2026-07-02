import type { Bot } from "grammy";
import { DateTime } from "luxon";
import { trackBotPost } from "../../services/bot-posts.ts";
import { getChatByTelegramId } from "../../services/members.ts";
import { buildRulesText } from "../../services/rules.ts";
import type { BotContext } from "../context.ts";

const WELCOME_TTL_HOURS = 4;
const RULES_TTL_HOURS = 24;

export function registerWelcomeHandlers(bot: Bot<BotContext>): void {
  bot.command("rules", async (ctx) => {
    if (!ctx.chat) return;

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    const timeStr = chat
      ? `${chat.checkinHour}:${String(chat.checkinMinute).padStart(2, "0")}`
      : undefined;

    const msg = await ctx.reply(buildRulesText(timeStr, chat?.graceMinSoberDays));

    if (chat) {
      await trackBotPost({
        db: ctx.db,
        chatId: chat.id,
        telegramMessageId: msg.message_id,
        kind: "command",
        deleteAfter: DateTime.utc().plus({ hours: RULES_TTL_HOURS }),
      });
    }
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
      const msg = await ctx.reply(text);

      if (chat) {
        await trackBotPost({
          db: ctx.db,
          chatId: chat.id,
          telegramMessageId: msg.message_id,
          kind: "command",
          deleteAfter: DateTime.utc().plus({ hours: WELCOME_TTL_HOURS }),
        });
      }
    }
  });
}
