import type { Bot } from "grammy";
import { isAdmin, isDevEnv } from "../../env.ts";
import { getChatByTelegramId } from "../../services/members.ts";
import { closeWindow, openWindow } from "../../services/window.ts";
import { texts } from "../../texts.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat } from "../context.ts";

export function registerDevHandlers(bot: Bot<BotContext>): void {
  bot.command("force_open", async (ctx) => {
    if (!isDevEnv()) {
      await ctx.reply(texts.devOnly);
      return;
    }
    if (!isGroupChat(ctx) || !ctx.from || !ctx.chat) {
      await ctx.reply(texts.notGroup);
      return;
    }
    if (!isAdmin(ctx.from.id)) {
      await ctx.reply(texts.notAdmin);
      return;
    }

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) {
      await ctx.reply(texts.notConfigured);
      return;
    }

    await openWindow({
      db: ctx.db,
      api: ctx.api,
      chat,
      scheduler: ctx.scheduler,
      force: true,
    });

    await ctx.reply(texts.forceOpenDone);
  });

  bot.command("force_close", async (ctx) => {
    if (!isDevEnv()) {
      await ctx.reply(texts.devOnly);
      return;
    }
    if (!isGroupChat(ctx) || !ctx.from || !ctx.chat) {
      await ctx.reply(texts.notGroup);
      return;
    }
    if (!isAdmin(ctx.from.id)) {
      await ctx.reply(texts.notAdmin);
      return;
    }

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) {
      await ctx.reply(texts.notConfigured);
      return;
    }

    const window = await ctx.db.query.dailyWindows.findFirst({
      where: (w, { and, eq }) => and(eq(w.chatId, chat.id), eq(w.status, "open")),
      orderBy: (w, { desc }) => desc(w.id),
    });

    if (!window) {
      await ctx.reply("No open window.");
      return;
    }

    await closeWindow({ db: ctx.db, api: ctx.api, chat, window });
    await ctx.reply(texts.forceCloseDone);
  });
}
