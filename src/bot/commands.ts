import type { Api } from "grammy";
import { isDevEnv } from "../env.ts";

interface BotCommandEntry {
  command: string;
  description: string;
}

/** Registers Telegram command menu entries (replaces manual BotFather /setcommands). */
export async function registerBotCommands(api: Api): Promise<void> {
  const memberGroupCommands: BotCommandEntry[] = [
    { command: "join", description: "Opt in to check-in tracking" },
    { command: "leave", description: "Opt out of tracking" },
    { command: "status", description: "Today's window and your streak" },
    { command: "help", description: "Show available commands" },
  ];

  const adminGroupCommands: BotCommandEntry[] = [
    { command: "setup", description: "Configure this group" },
    { command: "config", description: "Edit group settings" },
    ...(isDevEnv()
      ? [
          { command: "force_open", description: "Open check-in window now (dev)" },
          { command: "force_close", description: "Close window and summary (dev)" },
        ]
      : []),
    ...memberGroupCommands,
  ];

  const privateCommands: BotCommandEntry[] = [
    { command: "settings", description: "Personal timezone" },
    { command: "help", description: "Show available commands" },
  ];

  await api.setMyCommands(memberGroupCommands, { scope: { type: "all_group_chats" } });
  await api.setMyCommands(adminGroupCommands, { scope: { type: "all_chat_administrators" } });
  await api.setMyCommands(privateCommands, { scope: { type: "all_private_chats" } });
}
