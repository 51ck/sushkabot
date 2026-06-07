import { type Api, GrammyError, type InlineKeyboard } from "grammy";

/** Ignores Telegram 400 "message is not modified" when content/markup unchanged. */
export async function safeEditMessageText(
  api: Api,
  chatId: number,
  messageId: number,
  text: string,
  options?: { reply_markup?: InlineKeyboard },
): Promise<void> {
  try {
    await api.editMessageText(chatId, messageId, text, options);
  } catch (err) {
    if (
      err instanceof GrammyError &&
      err.error_code === 400 &&
      err.description.includes("message is not modified")
    ) {
      return;
    }
    throw err;
  }
}
