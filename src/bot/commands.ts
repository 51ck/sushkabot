import type { Api } from "grammy";
import { isDevEnv } from "../env.ts";

interface BotCommandEntry {
  command: string;
  description: string;
}

/** Registers Telegram command menu entries (replaces manual BotFather /setcommands). */
export async function registerBotCommands(api: Api): Promise<void> {
  const memberGroupCommands: BotCommandEntry[] = [
    { command: "stats", description: "Твоя статистика и стрики" },
    { command: "pledge", description: "Заявить: сегодня красавчик" },
    { command: "board", description: "Моментум группы" },
    { command: "rules", description: "Правила и как работает бот" },
    { command: "join", description: "Начать отслеживание" },
    { command: "leave", description: "Выйти из отслеживания" },
    { command: "help", description: "Список команд" },
  ];

  const adminGroupCommands: BotCommandEntry[] = [
    { command: "setup", description: "Настроить группу" },
    { command: "config", description: "Изменить настройки" },
    ...(isDevEnv()
      ? [
          { command: "force_open", description: "Открыть окно сейчас (dev)" },
          { command: "force_close", description: "Закрыть окно и итоги (dev)" },
        ]
      : []),
    ...memberGroupCommands,
  ];

  const privateCommands: BotCommandEntry[] = [
    { command: "settings", description: "Личный часовой пояс" },
    { command: "help", description: "Список команд" },
  ];

  await api.setMyCommands(memberGroupCommands, { scope: { type: "all_group_chats" } });
  await api.setMyCommands(adminGroupCommands, { scope: { type: "all_chat_administrators" } });
  await api.setMyCommands(privateCommands, { scope: { type: "all_private_chats" } });
}
