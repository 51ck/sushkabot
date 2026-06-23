import { env, isDevEnv } from "../env.ts";
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
const MAX_COMPLETION_TOKENS = 512;

export function isLlmEnabled(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

interface CompletionMessage {
  content?: string | null;
  reasoning_content?: string | null;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: CompletionMessage;
    finish_reason?: string;
  }>;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function normalizeApiBase(base: string): string {
  const trimmed = base.replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

/** Prefer final answer; ignore reasoning trace (not user-facing copy). */
export function extractCompletionText(data: ChatCompletionResponse): string | null {
  const choice = data.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (text) return truncateBody(text);

  const finishReason = choice?.finish_reason;
  if (finishReason === "length") {
    console.warn(
      "LLM returned empty content (finish_reason=length). " +
        "Reasoning models may need thinking disabled or higher max_tokens.",
    );
  }

  return null;
}

function truncateBody(text: string): string {
  const parts = text.split("\n\n");
  if (parts.length > 6) return parts.slice(0, 6).join("\n\n");
  return text.slice(0, 1200);
}

function buildCompletionPayload(messages: ChatMessage[]): Record<string, unknown> {
  return {
    model: env.OPENAI_MODEL,
    temperature: 0.9,
    max_tokens: MAX_COMPLETION_TOKENS,
    messages,
    // DeepSeek V4 enables thinking by default; it can consume the whole budget
    // and leave content empty on short copy tasks.
    extra_body: { thinking: { type: "disabled" } },
  };
}

async function chatComplete(messages: ChatMessage[]): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;

  const base = normalizeApiBase(env.OPENAI_API_BASE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(buildCompletionPayload(messages)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn(`LLM request failed (${response.status}): ${errBody.slice(0, 300)}`);
      return null;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = extractCompletionText(data);
    if (!text && isDevEnv()) {
      console.warn("LLM response had no usable content", JSON.stringify(data).slice(0, 400));
    }
    return text;
  } catch (error) {
    console.warn("LLM request error:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateCheckinBody(ctx: CheckinLlmContext): Promise<string> {
  const generated = await chatComplete([
    { role: "system", content: CHECKIN_SYSTEM_PROMPT },
    { role: "user", content: buildCheckinUserPrompt(ctx) },
  ]);
  return generated ?? DEFAULT_QUESTION;
}

export function isLlmFallbackText(text: string): boolean {
  return text.trim() === DEFAULT_QUESTION;
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
