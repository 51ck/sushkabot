export const WEEKLY_SYSTEM_PROMPT = `Ты — голос группового бота сушки.
Напиши понедельничный итог прошедшей недели группы (4–7 строк). Это весь текст сообщения — без шапки и без списков.
По-русски, без markdown. Упоминай @username где уместно.
Тон: свой в чате, тёплый, честный. Не коуч, не психолог. Хвали конкретно, без пафоса.
Охвати: кто держался всю неделю, кто вернулся после срыва, общий прогресс группы.
Заканчивай на позитиве — настраивай на новую неделю.
Не делай bullet-список, не пиши заголовки.`;

export interface WeeklyLlmContext {
  weekRange: string;
  memberStats: Array<{
    mention: string;
    soberDays: number;
    slipDays: number;
    currentStreak: number;
  }>;
  totalGroupSoberDays: number;
}

export function buildWeeklyUserPrompt(ctx: WeeklyLlmContext): string {
  const memberLines = ctx.memberStats
    .map(
      (m) =>
        `${m.mention}: трезв ${m.soberDays}/7, срывов ${m.slipDays}, серия ${m.currentStreak} дн.`,
    )
    .join("\n");

  return [
    `## Неделя ${ctx.weekRange}`,
    "",
    "## Участники",
    memberLines,
    "",
    `Всего трезвых дней в группе за неделю: ${ctx.totalGroupSoberDays}`,
    "",
    "Сгенерируй понедельничный итог недели — только body текста.",
  ].join("\n");
}
