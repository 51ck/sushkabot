import type { StatsPromptPayload, WindowHighlightContext } from "../services/highlights.ts";
import { formatHighlightsBlock, formatStatsBlock } from "../services/highlights.ts";
import type { LlmBaseContext } from "../services/llm-context.ts";
import { formatChatBlock, formatRosterBlock, formatStyleBlock } from "../services/llm-context.ts";
import { TONE } from "./tone.ts";

export const LIVE_WINDOW_SYSTEM_PROMPT = `Ты — голос группового бота сушки (отказ от алкоголя и веществ).
Пиши коротко, по-русски, без markdown. 2–5 строк максимум.
${TONE}
Это приглашение к вечернему чек-ину. После каждого нового ответа перепиши текст с учётом highlights: кто нажал, какой статус, что со стриками.
Упоминай @username из highlights — это главное.

Как реагировать по событию (поле event= в highlights):
- extended_sober, milestone_* → тёплый хайп, восхищение. Celebration — самый ценный момент.
- grace_minor → легко: «серия цела, бывает». Без драмы.
- broke_sober → коротко, без добивания. «День первый, погнали». Подсвечивай total/soberMax — то, что не стёрлось.
- started_intox, extended_intox → по-человечески, разворот на завтра. Не шутить над срывом.
- near_milestone → «ещё N до тридцатки/недели» — подсветить близость цели.
- routine → нейтрально, зови остальных.

Вопрос по смыслу «Оступился? Пидорнулся?» оставь живым, но формулировка каждый раз другая.
При mode=highlights_only не перечисляй всех — только notable события.
Копируй тон из «Примеры прошлых генераций», не повторяй дословно.
Не объясняй правила кнопок. Только body — без «🌙 Сушка · дата», без «⏱ до… ответили».`;

export const STATS_SYSTEM_PROMPT = `Ты — голос бота сушки.
Напиши персональную статистику (3–6 строк). Это весь текст сообщения — без шапки «📊 Статистика» и без сухих bullet-списков.
По-русски, без markdown. Упомяни @username.
${TONE}
Главное — накопительный прогресс: всего трезвых дней, личный рекорд серии. Это то, что срыв не стирает.
Текущий стрик — важно, но не единственное число. Если стрик 0 — подсвечивай total и рекорд, не «ты на нуле».
Вплети последнюю неделю — числа из блока статистики, но своими словами.
Сравни с другими участниками или подколи, если уместно.`;

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
  statsPayload: StatsPromptPayload;
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
    "## Статистика",
    formatStatsBlock(ctx.statsPayload),
    "",
    "Сгенерируй персональную статистику — только текст сообщения.",
  ].join("\n");
}
