import type { Api } from "grammy";

export const LLM_PARSE_MODE = "HTML" as const;

const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ins",
  "s",
  "strike",
  "del",
  "code",
  "pre",
  "a",
  "tg-spoiler",
]);

export function stripTelegramHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

export function sanitizeTelegramHtml(text: string): string {
  return text.replace(/<\/?([a-zA-Z0-9-]+)(?:\s[^>]*)?>/g, (match, tag: string) => {
    if (ALLOWED_TAGS.has(tag.toLowerCase())) return match;
    return "";
  });
}

export async function sendLlmMessage(
  api: Api,
  chatId: number,
  text: string,
  extra?: Parameters<Api["sendMessage"]>[2],
): Promise<Awaited<ReturnType<Api["sendMessage"]>>> {
  const sanitized = sanitizeTelegramHtml(text.trim());
  try {
    return await api.sendMessage(chatId, sanitized, { parse_mode: LLM_PARSE_MODE, ...extra });
  } catch (error) {
    console.warn("LLM message parse failed, sending plain:", error);
    return await api.sendMessage(chatId, stripTelegramHtml(sanitized), extra);
  }
}

export async function editLlmMessage(
  api: Api,
  chatId: number,
  messageId: number,
  text: string,
  extra?: Parameters<Api["editMessageText"]>[3],
): Promise<void> {
  const sanitized = sanitizeTelegramHtml(text.trim());
  try {
    await api.editMessageText(chatId, messageId, sanitized, {
      parse_mode: LLM_PARSE_MODE,
      ...extra,
    });
  } catch {
    try {
      await api.editMessageText(chatId, messageId, stripTelegramHtml(sanitized), extra);
    } catch {
      // unchanged or deleted
    }
  }
}
