import { env } from "../env.ts";

const SNIPPET_PROMPT_MAX = 200;

export interface BudgetSections {
  fixed: string;
  snippets: string[];
  roster: string[];
  styleExamples: string[];
}

export function trimSnippetForPrompt(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= SNIPPET_PROMPT_MAX) return trimmed;
  return `${trimmed.slice(0, SNIPPET_PROMPT_MAX)}…`;
}

/** Drop lowest-priority blocks until user prompt fits budget. */
export function trimContextToBudget(sections: BudgetSections): {
  snippets: string[];
  roster: string[];
  styleExamples: string[];
} {
  const maxChars = env.LLM_CONTEXT_MAX_CHARS;

  const snippets = sections.snippets.map(trimSnippetForPrompt);
  const roster = [...sections.roster];
  const styleExamples = [...sections.styleExamples];

  const measure = () =>
    sections.fixed.length +
    snippets.join("\n").length +
    roster.join("\n").length +
    styleExamples.join("\n").length;

  while (measure() > maxChars) {
    if (styleExamples.length > 0) {
      styleExamples.pop();
      continue;
    }
    if (roster.length > 1) {
      roster.pop();
      continue;
    }
    if (snippets.length > 3) {
      snippets.shift();
      continue;
    }
    break;
  }

  return { snippets, roster, styleExamples };
}

export function formatChatBlockFromLines(lines: string[]): string {
  if (lines.length === 0) return "(тишина в чате)";
  return lines.map((line) => `- ${line}`).join("\n");
}
