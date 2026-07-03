import type { LlmGenerationKind } from "../db/schema.ts";

const TASK_SUFFIX: Record<LlmGenerationKind, string> = {
  open: `Задача (open): 2–4 строки — напоминание с вопросом для вечернего чек-ина.
Вопрос по смыслу «Оступился сегодня?», формулировка каждый раз другая.`,

  live: `Задача (live): 2–5 строк — перепиши приглашение к чек-ину.
Отрази highlights (кто нажал, event=). Упоминай @username из highlights.

Реакция по event=:
- extended_sober, milestone_* → тёплый хайп
- hollow_milestone → честно: цифра есть, но с грейсами; без фанфар
- comeback → «вернулся в строй»
- fresh_start → «день первый, погнали»
- grace_minor → легко, серия цела
- broke_sober → коротко, подсвети total/soberMax
- started_intox, extended_intox → по-человечески, разворот на завтра
- near_milestone → «ещё N до цели»
- routine → зови остальных

При mode=highlights_only — только notable. Вопрос оставь живым.`,

  summary: `Задача (summary): 2–5 строк — вечерний итог группы, весь текст сообщения.
Вплети кто как ответил, стрики, momentum. Итог — конец дня, подъём даже после тяжёлого дня.
При срывах — накопительный прогресс. Без «Ответили: N/M».`,

  stats: `Задача (stats): 3–6 строк — персональная статистика, весь текст сообщения.
Главное — total трезвых и рекорд. Стрик 0 → подсвети total, не «на нуле».
Вплети pattern/quality если grace-heavy. Сравни с roster если уместно.`,

  chat: `Задача (chat): тебя явно спросили в группе — реплай на твоё сообщение или @mention.
Реши, нужен ли ответ. Если нет (оффтоп, флуд, уже ответили, риторический вопрос) — ответь ровно SKIP, без другого текста.
Если да — 1–4 строки по делу, в голосе бота. Не упоминай и не зови самого бота. Не проси нажать кнопку, если вопрос не про чек-ин.`,
};

let cachedBase: string | null = null;

async function loadBasePrompt(): Promise<string> {
  if (cachedBase) return cachedBase;
  cachedBase = (await Bun.file(new URL("./system.md", import.meta.url)).text()).trim();
  return cachedBase;
}

/** For tests: reset module cache. */
export function resetSystemPromptCache(): void {
  cachedBase = null;
}

export async function loadSystemPrompt(kind: LlmGenerationKind): Promise<string> {
  const base = await loadBasePrompt();
  const suffix = TASK_SUFFIX[kind];
  return `${base}\n\n${suffix}`;
}

export { TASK_SUFFIX };
