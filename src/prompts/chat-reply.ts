import type { LlmBaseContext } from "../services/llm-context.ts";
import { buildBasePromptSections } from "../services/llm-context.ts";

export interface ChatReplyTrigger {
  authorName: string;
  text: string;
  trigger: "mention" | "reply";
  repliedToText?: string | null;
  repliedToAuthor?: string | null;
  windowStatus?: string | null;
}

export interface ChatReplyLlmContext extends LlmBaseContext {
  trigger: ChatReplyTrigger;
}

export function buildChatReplyUserPrompt(ctx: ChatReplyLlmContext): string {
  const trigger = ctx.trigger;
  const triggerLines = [
    `author: ${trigger.authorName}`,
    `trigger: ${trigger.trigger}`,
    `message: ${trigger.text}`,
  ];
  if (trigger.repliedToText) {
    triggerLines.push(`reply_to_author: ${trigger.repliedToAuthor ?? "бот"}`);
    triggerLines.push(`reply_to_text: ${trigger.repliedToText}`);
  }
  if (trigger.windowStatus) {
    triggerLines.push(`today_window: ${trigger.windowStatus}`);
  }

  return [...buildBasePromptSections(ctx), "", "## Обращение", triggerLines.join("\n")].join("\n");
}

export function isChatReplySkip(text: string): boolean {
  const normalized = text.trim().toUpperCase();
  return normalized === "SKIP" || normalized === "ПРОПУСК";
}
