import type { LlmBaseContext } from "../services/llm-context.ts";
import { formatChatBlock, formatRosterBlock, formatStyleBlock } from "../services/llm-context.ts";

const TONE = `Тон: живой, органичный, свой в чате. Язвительность, эмоции, временами осуждение — в меру.
На срыв — подкол или лёгкое осуждение; на стрики — сарказм или уважение. Не сухо, не канцелярит.`;

export const CHECKIN_SYSTEM_PROMPT = `Ты — голос группового бота сушки (отказ от алкоголя и веществ).
Пиши коротко, по-русски, без markdown. 2–4 строки максимум.
${TONE}
Вопрос должен по смыслу совпадать с «Оступился? Пидорнулся?», но каждый раз формулировка другая.
Учитывай недавний чат и статистику участников — вплетай в текст, если уместно.
Не объясняй правила кнопок.`;

export const SUMMARY_SYSTEM_PROMPT = `Ты — голос группового бота сушки.
Напиши вечерний итог группы (2–5 строк). Это весь текст сообщения — без шапки и без списков.
По-русски, без markdown. Упоминай @username где уместно.
${TONE}
Вплети кто как ответил, стрики, контекст чата. Не пиши «Ответили: N/M» и не делай bullet-список.`;

export interface CheckinLlmContext extends LlmBaseContext {
  date: string;
  answeredCount: number;
  joinedCount: number;
}

export interface SummaryLlmContext extends LlmBaseContext {
  date: string;
  answeredCount: number;
  joinedCount: number;
  soberCount: number;
  minorSlipCount: number;
  majorSlipCount: number;
}

function buildBaseSections(ctx: LlmBaseContext): string[] {
  return [
    "## Примеры прошлых генераций",
    formatStyleBlock(ctx.styleExamples),
    "",
    "## Недавний чат",
    formatChatBlock(ctx.chatSnippets),
    "",
    "## Участники",
    formatRosterBlock(ctx.participants),
  ];
}

export function buildCheckinUserPrompt(ctx: CheckinLlmContext): string {
  return [
    ...buildBaseSections(ctx),
    "",
    "## Сегодня",
    `date: ${ctx.date}`,
    `answered: ${ctx.answeredCount}/${ctx.joinedCount}`,
    "",
    "Сгенерируй текст напоминания с вопросом для чек-ина.",
  ].join("\n");
}

export function buildSummaryUserPrompt(ctx: SummaryLlmContext): string {
  return [
    ...buildBaseSections(ctx),
    "",
    "## Итоги дня",
    `date: ${ctx.date}`,
    `answered: ${ctx.answeredCount}/${ctx.joinedCount}`,
    `красавчики: ${ctx.soberCount}, оступились: ${ctx.minorSlipCount}, пидорнулись: ${ctx.majorSlipCount}`,
    "",
    "Сгенерируй вечерний итог — только body текста.",
  ].join("\n");
}
