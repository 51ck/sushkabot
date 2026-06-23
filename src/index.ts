import { createBot } from "./bot/bot.ts";
import { registerBotCommands } from "./bot/commands.ts";
import { createDatabase, initDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { env } from "./env.ts";
import { clearDebounceTimers } from "./services/message-debounce.ts";

async function main() {
  const { sqlite } = createDatabase(env.DATABASE_PATH);
  runMigrations(sqlite);

  const db = initDb(env.DATABASE_PATH);
  const { bot, scheduler } = createBot(env.BOT_TOKEN, db);

  await scheduler.start();

  const shutdown = () => {
    scheduler.stop();
    clearDebounceTimers();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  if (env.LOG_LEVEL === "debug") {
    bot.use(async (ctx, next) => {
      console.debug("Update:", ctx.update.update_id);
      await next();
    });
  }

  console.info(`Sushkabot starting (${env.BOT_ENV})`);
  await bot.start({
    allowed_updates: [
      "message",
      "callback_query",
      "my_chat_member",
      "message_reaction",
      "message_reaction_count",
    ],
    onStart: async (info) => {
      console.info(`Logged in as @${info.username}`);
      await registerBotCommands(bot.api);
      console.info("Bot commands registered with Telegram");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
