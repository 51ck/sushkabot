import type { Bot } from "grammy";
import { markBotPostReplied } from "../../services/bot-posts.ts";
import { appendChatSnippet } from "../../services/chat-snippets.ts";
import { getChatByTelegramId } from "../../services/members.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat } from "../context.ts";

export function registerChatLogHandlers(bot: Bot<BotContext>): void {
  bot.on("message", async (ctx, next) => {
    if (!isGroupChat(ctx) || !ctx.chat || !ctx.message) {
      await next();
      return;
    }

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) {
      await next();
      return;
    }

    const replyTo = ctx.message.reply_to_message;
    if (replyTo?.message_id) {
      await markBotPostReplied(ctx.db, chat.id, replyTo.message_id);
    }

    const text = ctx.message.text ?? ctx.message.caption;
    if (text && !text.startsWith("/")) {
      const authorName =
        ctx.from?.username != null
          ? `@${ctx.from.username}`
          : [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "участник";

      await appendChatSnippet({
        db: ctx.db,
        chatId: chat.id,
        telegramMessageId: ctx.message.message_id,
        authorName,
        text,
      });
    }

    await next();
  });
}
