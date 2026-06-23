import { env } from "../env.ts";
import {
  buildLiveWindowUserPrompt,
  buildStatsUserPrompt,
  LIVE_WINDOW_SYSTEM_PROMPT,
  STATS_SYSTEM_PROMPT,
  type StatsLlmContext,
} from "../prompts/live-window.ts";
import {
  buildCheckinUserPrompt,
  buildSummaryUserPrompt,
  CHECKIN_SYSTEM_PROMPT,
  type CheckinLlmContext,
  SUMMARY_SYSTEM_PROMPT,
  type SummaryLlmContext,
} from "../prompts/messages.ts";
import { DEFAULT_QUESTION } from "../types.ts";
import type { WindowHighlightContext } from "./highlights.ts";

const REQUEST_TIMEOUT_MS = 8000;

export function isLlmEnabled(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chatComplete(messages: ChatMessage[]): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;

  const base = env.OPENAI_API_BASE.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.9,
        max_tokens: 250,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? truncateBody(text) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function truncateBody(text: string): string {
  const parts = text.split("\n\n");
  if (parts.length > 6) return parts.slice(0, 6).join("\n\n");
  return text.slice(0, 1200);
}

export async function generateCheckinBody(ctx: CheckinLlmContext): Promise<string> {
  const generated = await chatComplete([
    { role: "system", content: CHECKIN_SYSTEM_PROMPT },
    { role: "user", content: buildCheckinUserPrompt(ctx) },
  ]);
  return generated ?? DEFAULT_QUESTION;
}

export async function generateSummaryIntro(ctx: SummaryLlmContext): Promise<string | null> {
  return chatComplete([
    { role: "system", content: SUMMARY_SYSTEM_PROMPT },
    { role: "user", content: buildSummaryUserPrompt(ctx) },
  ]);
}

export async function generateLiveWindowBody(ctx: WindowHighlightContext): Promise<string | null> {
  return chatComplete([
    { role: "system", content: LIVE_WINDOW_SYSTEM_PROMPT },
    { role: "user", content: buildLiveWindowUserPrompt(ctx) },
  ]);
}

export async function generatePersonalStats(ctx: StatsLlmContext): Promise<string | null> {
  return chatComplete([
    { role: "system", content: STATS_SYSTEM_PROMPT },
    { role: "user", content: buildStatsUserPrompt(ctx) },
  ]);
}

export function formatStatsFallback(payload: Record<string, unknown>): string {
  const mention = String(payload.mention ?? "ты");
  return [
    `📊 Статистика · ${mention}`,
    "",
    `Трезвость: ${payload.soberCurrent} (макс ${payload.soberMax})`,
    `Срыв: ${payload.intoxCurrent} (макс ${payload.intoxMax})`,
    `Всего: ${payload.totalSoberDays} трезвых / ${payload.totalSlipDays} срывных дней`,
  ].join("\n");
}
