import type { Api, InlineKeyboard } from "grammy";
import { env } from "../env.ts";
import { editLlmMessage } from "../utils/telegram-format.ts";

const editPending = new Map<string, ReturnType<typeof setTimeout>>();
const llmPending = new Map<string, ReturnType<typeof setTimeout>>();

const MIN_EDIT_INTERVAL_MS = Number(process.env.DEBOUNCE_MS ?? 2000);

export async function debouncedEditMessage(
  api: Api,
  params: {
    chat_id: number;
    message_id: number;
    text: string;
    reply_markup?: InlineKeyboard;
  },
): Promise<void> {
  const key = `edit:${params.chat_id}:${params.message_id}`;

  const existing = editPending.get(key);
  if (existing) clearTimeout(existing);

  await new Promise<void>((resolve) => {
    const timer = setTimeout(async () => {
      editPending.delete(key);
      try {
        await editLlmMessage(api, params.chat_id, params.message_id, params.text, {
          reply_markup: params.reply_markup,
        });
      } catch {
        // Message may be unchanged or deleted
      }
      resolve();
    }, MIN_EDIT_INTERVAL_MS);
    editPending.set(key, timer);
  });
}

export function debouncedLlmRegen(key: string, fn: () => Promise<void>): void {
  const existing = llmPending.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    llmPending.delete(key);
    try {
      await fn();
    } catch (error) {
      console.warn("LLM regen failed:", error);
    }
  }, env.LLM_DEBOUNCE_MS);

  llmPending.set(key, timer);
}

export function clearDebounceTimers(): void {
  for (const timer of editPending.values()) clearTimeout(timer);
  editPending.clear();
  for (const timer of llmPending.values()) clearTimeout(timer);
  llmPending.clear();
}
