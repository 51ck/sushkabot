import type { WindowHighlightContext } from "../services/highlights.ts";

export const LIVE_WINDOW_SYSTEM_PROMPT = `Ты — голос группового бота сушки (отказ от алкоголя и веществ).
Пиши коротко, по-русски, без markdown. 2–5 строк максимум.
Тон: свой в чате, без осуждения за срыв, лёгкий вызов отметиться.
Вопрос по смыслу «Оступился? Пидорнулся?», но каждый раз формулировка другая.
Упоминай @username из highlights когда уместно.
При mode=highlights_only не перечисляй всех — только notable события.
Grace-день (оступился раз — стрик трезвости жив) можно отметить отдельно.
Копируй тон из «Примеры прошлых генераций», не повторяй дословно.
Не объясняй правила кнопок. Только body текста — без шапки «Сушка» и без footer со счётчиком.`;

export const STATS_SYSTEM_PROMPT = `Ты — голос бота сушки. Напиши короткий персональный текст статистики (3–6 строк).
По-русски, без markdown. Упомяни @username.
Включи текущие и максимальные стрики трезвости и срыва, общие дни, последние 7 дней одной фразой.
Тон: поддержка без осуждения, свой в чате.`;

export function buildLiveWindowUserPrompt(ctx: WindowHighlightContext): string {
  const styleBlock =
    ctx.styleExamples.length > 0
      ? ctx.styleExamples.map((e) => `- [${e.kind}] ${e.text}`).join("\n")
      : "(нет примеров)";

  const chatBlock =
    ctx.chatSnippets.length > 0
      ? ctx.chatSnippets.map((s) => `- ${s.authorName}: ${s.text}`).join("\n")
      : "(тишина в чате)";

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
    styleBlock,
    "",
    "## Недавний чат",
    chatBlock,
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

export function buildStatsUserPrompt(payload: Record<string, unknown>): string {
  return `${JSON.stringify(payload, null, 2)}\n\nСгенерируй персональную статистику.`;
}
