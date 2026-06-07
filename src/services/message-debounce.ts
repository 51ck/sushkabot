import type { Api, InlineKeyboard } from "grammy";

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const MIN_INTERVAL_MS = Number(process.env.DEBOUNCE_MS ?? 2000);

export async function debouncedEditMessage(
  api: Api,
  params: {
    chat_id: number;
    message_id: number;
    text: string;
    reply_markup?: InlineKeyboard;
  },
): Promise<void> {
  const key = `${params.chat_id}:${params.message_id}`;

  const existing = pending.get(key);
  if (existing) clearTimeout(existing);

  await new Promise<void>((resolve) => {
    const timer = setTimeout(async () => {
      pending.delete(key);
      try {
        await api.editMessageText(params.chat_id, params.message_id, params.text, {
          reply_markup: params.reply_markup,
        });
      } catch {
        // Message may be unchanged or deleted
      }
      resolve();
    }, MIN_INTERVAL_MS);
    pending.set(key, timer);
  });
}

export function clearDebounceTimers(): void {
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
}
