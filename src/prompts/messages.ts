export const CHECKIN_SYSTEM_PROMPT = `Ты — голос группового бота сушки (отказ от алкоголя и веществ).
Пиши коротко, по-русски, без markdown. 2–4 строки максимум.
Тон: свой в чате, без осуждения за срыв, лёгкий вызов отметиться.
Вопрос должен по смыслу совпадать с «Оступился? Пидорнулся?», но каждый раз формулировка другая.
Не объясняй правила кнопок.`;

export const SUMMARY_SYSTEM_PROMPT = `Ты — голос группового бота сушки.
Напиши одну короткую вводную строку (до 120 символов) к вечернему итогу группы.
По-русски, без markdown, без списков. Поддержка и лёгкий вызов на завтра.`;

export function buildCheckinUserPrompt(params: {
  date: string;
  answeredCount: number;
  joinedCount: number;
}): string {
  return [
    `Дата: ${params.date}`,
    `Уже ответили: ${params.answeredCount} из ${params.joinedCount} участников.`,
    "Сгенерируй текст напоминания с вопросом для чек-ина.",
  ].join("\n");
}

export function buildSummaryUserPrompt(params: {
  date: string;
  answeredCount: number;
  joinedCount: number;
  soberCount: number;
  minorSlipCount: number;
  majorSlipCount: number;
}): string {
  return [
    `Дата: ${params.date}`,
    `Ответили: ${params.answeredCount}/${params.joinedCount}.`,
    `Красавчики: ${params.soberCount}, оступились: ${params.minorSlipCount}, пидорнулись: ${params.majorSlipCount}.`,
    "Одна вводная строка к итогам.",
  ].join("\n");
}
