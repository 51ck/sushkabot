import { eq } from "drizzle-orm";
import { Bot, type BotConfig } from "grammy";
import type { AppDatabase } from "../db/client.ts";
import { chats } from "../db/schema.ts";
import { SchedulerService } from "../services/scheduler.ts";
import type { BotContext } from "./context.ts";
import { registerChatLogHandlers } from "./handlers/chat-log.ts";
import { registerCheckinHandlers } from "./handlers/checkin.ts";
import { registerCommonHandlers } from "./handlers/common.ts";
import { registerDevHandlers } from "./handlers/dev.ts";
import { registerReactionHandlers } from "./handlers/reactions.ts";
import { registerSettingsHandlers } from "./handlers/settings.ts";
import { registerSetupWizardHandlers } from "./handlers/setup-wizard.ts";

export function createBot(
  token: string,
  db: AppDatabase,
  config?: Omit<BotConfig<BotContext>, "botInfo"> & { botInfo?: BotConfig<BotContext>["botInfo"] },
): { bot: Bot<BotContext>; scheduler: SchedulerService } {
  const bot = new Bot<BotContext>(token, config);
  const scheduler = new SchedulerService(db, () => bot.api);

  bot.use(async (ctx, next) => {
    ctx.db = db;
    ctx.scheduler = scheduler;
    await next();
  });

  registerCommonHandlers(bot);
  registerChatLogHandlers(bot);
  registerReactionHandlers(bot);
  registerSetupWizardHandlers(bot);
  registerSettingsHandlers(bot);
  registerCheckinHandlers(bot);
  registerDevHandlers(bot);

  bot.on("my_chat_member", async (ctx) => {
    const update = ctx.myChatMember;
    const status = update.new_chat_member.status;
    if (status === "left" || status === "kicked") {
      const telegramChatId = String(update.chat.id);
      const chat = await db.query.chats.findFirst({
        where: eq(chats.telegramChatId, telegramChatId),
      });
      if (chat) {
        await db.update(chats).set({ enabled: false }).where(eq(chats.id, chat.id));
        scheduler.unregisterChat(chat.id);
      }
    }
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return { bot, scheduler };
}
