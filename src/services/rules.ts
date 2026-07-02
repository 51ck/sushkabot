import { formatGraceMinSoberDays } from "../types.ts";

export function buildRulesText(chatTime?: string, graceMinSoberDays = 7): string {
  const timeNote = chatTime ? ` в ${chatTime}` : "";
  const graceNote =
    graceMinSoberDays === 0
      ? "Первый срыв не сбивает серию (грейс с первого дня)."
      : `Грейс: первый срыв не сбивает серию, если до этого ≥ ${formatGraceMinSoberDays(graceMinSoberDays)} трезвости.`;
  return [
    "Как работает бот:",
    "",
    `Каждый вечер${timeNote} открывается окно — две кнопки:`,
    "💪 Красавчик — трезв",
    "🍺 Оступился — срыв",
    "",
    "Сначала /join — иначе кнопки не сработают.",
    "Не ответил до закрытия — засчитывается «Оступился».",
    graceNote,
    "Повторный «Оступился» на следующий день — серьёзный срыв, серия прерывается.",
    "Вехи: 7, 14, 30, 60, 90 дней.",
    "",
    "/join — вступить в отслеживание  /leave — выйти",
    "Вышел из чата — отслеживание снимается автоматически.",
    "/stats — статистика  /pledge — заявить трезвость  /board — лидерборд",
  ].join("\n");
}
