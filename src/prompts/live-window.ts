import type { WindowHighlightContext } from "../services/highlights.ts";
import { formatHighlightsBlock } from "../services/highlights.ts";
import type { LlmBaseContext } from "../services/llm-context.ts";
import { formatChatBlock, formatRosterBlock, formatStyleBlock } from "../services/llm-context.ts";

const TONE = `Тон: живой, органичный, свой в чате. Язвительность, эмоции, временами осуждение — в меру.
На срыв — подкол или лёгкое осуждение; на стрики — сарказм или уважение. Не сухо, не канцелярит.`;

export const LIVE_WINDOW_SYSTEM_PROMPT = `Ты — голос группового бота сушки (отказ от алкоголя и веществ).
Пиши коротко, по-русски, без markdown. 2–5 строк максимум.
${TONE}
Это приглашение к вечернему чек-ину. После каждого нового ответа перепиши текст с учётом highlights: кто нажал, какой статус, что со стриками.
Упоминай @username из highlights — это главное. Вплети подкол или похвалу по событию (grace, milestone, срыв).
Вопрос по смыслу «Оступился? Пидорнулся?» оставь живым, но формулировка каждый раз другая.
При mode=highlights_only не перечисляй всех — только notable события.
Копируй тон из «Примеры прошлых генераций», не повторяй дословно.
Не объясняй правила кнопок. Только body — без «🌙 Сушка · дата», без «⏱ до… ответили».`;

export const STATS_SYSTEM_PROMPT = `Ты — голос бота сушки. Напиши короткий персональный текст статистики (3–6 строк).
По-русски, без markdown. Упомяни @username.
Включи текущие и максимальные стрики трезвости и срыва, общие дни, последние 7 дней одной фразой.
${TONE}
Учитывай контекст чата и статистику других участников для сравнения или подкола.`;

export function buildLiveWindowUserPrompt(ctx: WindowHighlightContext): string {
  return [
    "## Примеры прошлых генераций",
    formatStyleBlock(ctx.styleExamples),
    "",
    "## Недавний чат",
    formatChatBlock(ctx.chatSnippets),
    "",
    "## Участники",
    formatRosterBlock(ctx.participants),
    "",
    "## Сегодня",
    `date: ${ctx.checkinDate}`,
    `answered: ${ctx.answeredCount}/${ctx.joinedCount}`,
    `closes_at: ${ctx.closesAt}`,
    `mode: ${ctx.mode}`,
    "",
    "## Ответы сегодня (highlights)",
    formatHighlightsBlock(ctx.highlights),
    "",
    "Перепиши приглашение к чек-ину: отрази новые ответы из highlights + зови остальных отметиться.",
  ].join("\n");
}

export interface StatsLlmContext extends LlmBaseContext {
  statsPayload: Record<string, unknown>;
}

export function buildStatsUserPrompt(ctx: StatsLlmContext): string {
  return [
    "## Примеры прошлых генераций",
    formatStyleBlock(ctx.styleExamples),
    "",
    "## Недавний чат",
    formatChatBlock(ctx.chatSnippets),
    "",
    "## Участники",
    formatRosterBlock(ctx.participants),
    "",
    "## Персональная статистика",
    JSON.stringify(ctx.statsPayload, null, 2),
    "",
    "Сгенерируй персональную статистику.",
  ].join("\n");
}
