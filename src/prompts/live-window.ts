import type { StatsPromptPayload, WindowHighlightContext } from "../services/highlights.ts";
import { formatHighlightsBlock, formatStatsBlock } from "../services/highlights.ts";
import { applyContextBudget, buildBasePromptSections } from "../services/llm-context.ts";
import { formatQualityOneLiner } from "../services/streak-quality.ts";

export function buildLiveWindowUserPrompt(ctx: WindowHighlightContext): string {
  const tail = [
    "## Сегодня",
    `date: ${ctx.checkinDate}`,
    `answered: ${ctx.answeredCount}/${ctx.joinedCount}`,
    `mode: ${ctx.mode}`,
    "",
    "## Ответы сегодня (highlights)",
    formatHighlightsBlock(ctx.highlights),
    "",
    "Перепиши приглашение к чек-ину: отрази новые ответы из highlights + зови остальных отметиться.",
  ].join("\n");

  const fixed = [...buildBasePromptSections(ctx), "", tail].join("\n");
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

  const ctxTrimmed = { ...ctx, ...trimmed };
  return [...buildBasePromptSections(ctxTrimmed), "", tail].join("\n");
}

export interface StatsLlmContext {
  schedule: WindowHighlightContext["schedule"];
  chatSnippets: WindowHighlightContext["chatSnippets"];
  styleExamples: WindowHighlightContext["styleExamples"];
  participants: WindowHighlightContext["participants"];
  statsPayload: StatsPromptPayload;
}

export function buildStatsUserPrompt(ctx: StatsLlmContext): string {
  const tail = [
    "## Статистика",
    formatStatsBlock(ctx.statsPayload),
    "",
    "Сгенерируй персональную статистику — только текст сообщения.",
  ].join("\n");

  const baseCtx = {
    schedule: ctx.schedule,
    chatSnippets: ctx.chatSnippets,
    styleExamples: ctx.styleExamples,
    participants: ctx.participants,
  };

  const fixed = [...buildBasePromptSections(baseCtx), "", tail].join("\n");
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

  const ctxTrimmed = { ...baseCtx, ...trimmed };
  return [...buildBasePromptSections(ctxTrimmed), "", tail].join("\n");
}
