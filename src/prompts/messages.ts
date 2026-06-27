import type { LlmBaseContext } from "../services/llm-context.ts";
import { applyContextBudget, buildBasePromptSections } from "../services/llm-context.ts";
import { formatQualityOneLiner } from "../services/streak-quality.ts";

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
  momentum?: string;
}

function trimContext<T extends LlmBaseContext>(ctx: T, fixedTail: string): T {
  const fixed = [...buildBasePromptSections(ctx), "", fixedTail].join("\n");
  const trimmed = applyContextBudget({
    fixed,
    chatSnippets: ctx.chatSnippets,
    participants: ctx.participants,
    styleExamples: ctx.styleExamples,
    formatSnippet: (s) => `${s.authorName}: ${s.text}`,
    formatRoster: (p) =>
      formatQualityOneLiner({
        mention: p.mention,
        soberCurrent: p.soberCurrent,
        soberMax: p.soberMax,
        totalSoberDays: p.totalSoberDays,
        quality: p.quality,
      }),
    formatStyle: (e) => `- [${e.kind}] ${e.text}`,
  });
  return {
    ...ctx,
    chatSnippets: trimmed.chatSnippets,
    participants: trimmed.participants,
    styleExamples: trimmed.styleExamples,
  };
}

export function buildCheckinUserPrompt(ctx: CheckinLlmContext): string {
  const tail = [
    "## Сегодня",
    `date: ${ctx.date}`,
    `answered: ${ctx.answeredCount}/${ctx.joinedCount}`,
    "",
    "Сгенерируй текст напоминания с вопросом для чек-ина.",
  ].join("\n");

  const trimmed = trimContext(ctx, tail);
  return [...buildBasePromptSections(trimmed), "", tail].join("\n");
}

export function buildSummaryUserPrompt(ctx: SummaryLlmContext): string {
  const tailParts = [
    "## Итоги дня",
    `date: ${ctx.date}`,
    `answered: ${ctx.answeredCount}/${ctx.joinedCount}`,
    `красавчики: ${ctx.soberCount}, оступились: ${ctx.minorSlipCount}, major: ${ctx.majorSlipCount}`,
  ];

  if (ctx.momentum) {
    tailParts.push("", "## Моментум группы", ctx.momentum);
  }

  tailParts.push("", "Сгенерируй вечерний итог — только body текста.");
  const tail = tailParts.join("\n");

  const trimmed = trimContext(ctx, tail);
  return [...buildBasePromptSections(trimmed), "", tail].join("\n");
}
