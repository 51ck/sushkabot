import type { WindowHighlightContext } from "../services/highlights.ts";
import type { LlmBaseContext } from "../services/llm-context.ts";
import { formatChatBlock, formatRosterBlock, formatStyleBlock } from "../services/llm-context.ts";

const TONE = `Тон: живой, органичный, свой в чате. Язвительность, эмоции, временами осуждение — в меру.
На срыв — подкол или лёгкое осуждение; на стрики — сарказм или уважение. Не сухо, не канцелярит.`;

export const LIVE_WINDOW_SYSTEM_PROMPT = `Ты — голос группового бота сушки (отказ от алкоголя и веществ).
Пиши коротко, по-русски, без markdown. 2–5 строк максимум.
${TONE}
Вопрос по смыслу «Оступился? Пидорнулся?», но каждый раз формулировка другая.
Упоминай @username из highlights когда уместно.
При mode=highlights_only не перечисляй всех — только notable события.
Grace-день (оступился раз — стрик трезвости жив) можно отметить отдельно.
Копируй тон из «Примеры прошлых генераций», не повторяй дословно.
Не объясняй правила кнопок. Только body текста — без шапки «Сушка» и без footer со счётчиком.`;

export const STATS_SYSTEM_PROMPT = `Ты — голос бота сушки. Напиши короткий персональный текст статистики (3–6 строк).
По-русски, без markdown. Упомяни @username.
Включи текущие и максимальные стрики трезвости и срыва, общие дни, последние 7 дней одной фразой.
${TONE}
Учитывай контекст чата и статистику других участников для сравнения или подкола.`;

export function buildLiveWindowUserPrompt(ctx: WindowHighlightContext): string {
  const highlightBlock =
    ctx.highlights.length > 0
      ? JSON.stringify(
          ctx.highlights.map((h) => ({
            mention: h.mention,
            status: h.statusLabel,
            event: h.event,
            soberBefore: h.soberStreakBefore,
            soberAfter: h.soberStreakAfter,
            intoxAfter: h.intoxStreakAfter,
          })),
          null,
          2,
        )
      : "[]";

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
    "highlights:",
    highlightBlock,
    "",
    "Сгенерируй body для editMessageText.",
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
