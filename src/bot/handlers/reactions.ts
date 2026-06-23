import type { Bot } from "grammy";
import { markBotPostReacted } from "../../services/bot-posts.ts";
import { getChatByTelegramId } from "../../services/members.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat } from "../context.ts";

function hasAnyReaction(reactions: unknown[] | undefined): boolean {
  return Array.isArray(reactions) && reactions.length > 0;
}

export function registerReactionHandlers(bot: Bot<BotContext>): void {
  bot.on("message_reaction", async (ctx) => {
    if (!isGroupChat(ctx) || !ctx.chat) return;

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) return;

    const messageId = ctx.messageReaction.message_id;
    if (hasAnyReaction(ctx.messageReaction.new_reaction)) {
      await markBotPostReacted(ctx.db, chat.id, messageId);
    }
  });

  bot.on("message_reaction_count", async (ctx) => {
    if (!isGroupChat(ctx) || !ctx.chat) return;

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) return;

    const messageId = ctx.messageReactionCount.message_id;
    const reactions = ctx.messageReactionCount.reactions;
    if (reactions?.some((r) => r.total_count > 0)) {
      await markBotPostReacted(ctx.db, chat.id, messageId);
    }
  });
}
