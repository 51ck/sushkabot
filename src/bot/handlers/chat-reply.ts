import type { Bot } from "grammy";
import { DateTime } from "luxon";
import { env } from "../../env.ts";
import { isChatReplySkip } from "../../prompts/chat-reply.ts";
import { generateChatReply, isLlmEnabled } from "../../services/llm.ts";
import { buildLlmBaseContext } from "../../services/llm-context.ts";
import { recordLlmGeneration } from "../../services/llm-generations.ts";
import { getChatByTelegramId } from "../../services/members.ts";
import { sendLlmMessage } from "../../utils/telegram-format.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat } from "../context.ts";

type IncomingMessage = NonNullable<BotContext["message"]>;

function authorName(from: NonNullable<BotContext["from"]>): string {
  if (from.username) return `@${from.username}`;
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || "участник";
}

function messageAddressesBot(
  message: IncomingMessage,
  botId: number,
  botUsername?: string,
): "mention" | "reply" | null {
  const replyFrom = message.reply_to_message?.from;
  if (replyFrom?.id === botId) {
    if (message.from?.id === botId) return null;
    return "reply";
  }

  if (!botUsername) return null;
  const text = message.text ?? message.caption ?? "";
  const mention = `@${botUsername}`;
  if (!text.toLowerCase().includes(mention.toLowerCase())) return null;

  const entities = message.entities ?? message.caption_entities ?? [];
  const mentionedViaEntity = entities.some(
    (entity: { type: string; offset: number; length: number }) => {
      if (entity.type !== "mention") return false;
      const slice = text.slice(entity.offset, entity.offset + entity.length);
      return slice.toLowerCase() === mention.toLowerCase();
    },
  );
  if (mentionedViaEntity || text.toLowerCase().includes(mention.toLowerCase())) return "mention";

  return null;
}

export function registerChatReplyHandlers(bot: Bot<BotContext>): void {
  bot.on("message:text", async (ctx) => {
    if (!isGroupChat(ctx) || !ctx.chat || !ctx.message || !ctx.from) return;
    if (ctx.from.is_bot || ctx.message.text.startsWith("/")) return;
    if (!isLlmEnabled()) return;

    const botInfo = ctx.me;
    const triggerKind = messageAddressesBot(ctx.message, botInfo.id, botInfo.username);
    if (!triggerKind) return;

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat?.enabled) return;

    const today = DateTime.now().setZone(chat.timezone).toISODate() ?? "";
    const nowLocal = DateTime.now().setZone(chat.timezone);
    const closesAt = nowLocal
      .set({ hour: chat.checkinHour, minute: chat.checkinMinute, second: 0, millisecond: 0 })
      .plus({ minutes: chat.windowDurationMinutes });

    const window = await ctx.db.query.dailyWindows.findFirst({
      where: (w, { and, eq }) => and(eq(w.chatId, chat.id), eq(w.checkinDate, today)),
    });

    const replyTo = ctx.message.reply_to_message;
    const repliedToText = replyTo?.text ?? replyTo?.caption ?? null;
    const repliedToAuthor = replyTo?.from
      ? replyTo.from.username
        ? `@${replyTo.from.username}`
        : replyTo.from.first_name
      : null;

    const llmCtx = await buildLlmBaseContext({
      db: ctx.db,
      chat,
      asOfDate: today,
      closesAt,
      now: nowLocal,
      kind: "chat",
    });

    const reply = await generateChatReply({
      ...llmCtx,
      trigger: {
        authorName: authorName(ctx.from),
        text: ctx.message.text,
        trigger: triggerKind,
        repliedToText,
        repliedToAuthor,
        windowStatus: window?.status ?? null,
      },
    });

    if (!reply || isChatReplySkip(reply)) return;

    await sendLlmMessage(ctx.api, ctx.chat.id, reply, {
      reply_parameters: { message_id: ctx.message.message_id },
    });

    if (env.OPENAI_API_KEY) {
      await recordLlmGeneration({ db: ctx.db, chatId: chat.id, kind: "chat", text: reply });
    }
  });
}
