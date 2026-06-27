import { env, isDevEnv } from "../env.ts";
import {
  buildLiveWindowUserPrompt,
  buildStatsUserPrompt,
  type StatsLlmContext,
} from "../prompts/live-window.ts";
import { loadSystemPrompt } from "../prompts/load-system.ts";
import {
  buildCheckinUserPrompt,
  buildSummaryUserPrompt,
  type CheckinLlmContext,
  type SummaryLlmContext,
} from "../prompts/messages.ts";
import { DEFAULT_QUESTION } from "../types.ts";
import type { StatsPromptPayload, WindowHighlightContext } from "./highlights.ts";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_COMPLETION_TOKENS = 1024;

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

export function shouldDisableDeepSeekThinking(apiBase: string): boolean {
  return apiBase.includes("deepseek");
}

export function buildLlmRequestPayload(
  messages: ChatMessage[],
  apiBase = env.OPENAI_API_BASE,
): Record<string, unknown> {
  const tokenKey = shouldDisableDeepSeekThinking(apiBase) ? "max_tokens" : "max_completion_tokens";
  const payload: Record<string, unknown> = {
    model: env.OPENAI_MODEL,
    temperature: 0.9,
    [tokenKey]: MAX_COMPLETION_TOKENS,
    messages,
  };

  if (shouldDisableDeepSeekThinking(apiBase)) {
    payload.thinking = { type: "disabled" };
  }

  return payload;
}

async function chatComplete(messages: ChatMessage[], label: string): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;

  const base = normalizeApiBase(env.OPENAI_API_BASE);
  const payload = buildLlmRequestPayload(messages);
  const url = `${base}/chat/completions`;

  if (env.LOG_LEVEL === "debug") {
    console.debug(`LLM → ${label}`, url);
    console.debug(`LLM → ${label} payload:\n${JSON.stringify(payload, null, 2)}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn(`LLM request failed (${response.status}): ${errBody.slice(0, 300)}`);
      return null;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const text = extractCompletionText(data);

    if (env.LOG_LEVEL === "debug") {
      console.debug(`LLM ← ${label}:`, text ?? "(empty)");
      if (!text) {
        console.debug(`LLM ← ${label} raw:`, JSON.stringify(data).slice(0, 2000));
      }
    } else if (!text && isDevEnv()) {
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
  const system = await loadSystemPrompt("open");
  const generated = await chatComplete(
    [
      { role: "system", content: system },
      { role: "user", content: buildCheckinUserPrompt(ctx) },
    ],
    "open",
  );
  return generated ?? DEFAULT_QUESTION;
}

export function isLlmFallbackText(text: string): boolean {
  return text.trim() === DEFAULT_QUESTION;
}

export async function generateSummaryIntro(ctx: SummaryLlmContext): Promise<string | null> {
  const system = await loadSystemPrompt("summary");
  return chatComplete(
    [
      { role: "system", content: system },
      { role: "user", content: buildSummaryUserPrompt(ctx) },
    ],
    "summary",
  );
}

export async function generateLiveWindowBody(ctx: WindowHighlightContext): Promise<string | null> {
  const system = await loadSystemPrompt("live");
  return chatComplete(
    [
      { role: "system", content: system },
      { role: "user", content: buildLiveWindowUserPrompt(ctx) },
    ],
    "live",
  );
}

export async function generatePersonalStats(ctx: StatsLlmContext): Promise<string | null> {
  const system = await loadSystemPrompt("stats");
  const generated = await chatComplete(
    [
      { role: "system", content: system },
      { role: "user", content: buildStatsUserPrompt(ctx) },
    ],
    "stats",
  );
  return generated ? sanitizeStatsBody(generated) : null;
}

export function sanitizeStatsBody(text: string): string {
  let body = text.trim();
  body = body.replace(/^📊\s*Статистика\s*·[^\n]*\n*/m, "");
  body = body.replace(/^Трезвость:\s*\d+[^\n]*\n/m, "");
  body = body.replace(/^Срыв:\s*\d+[^\n]*\n/m, "");
  body = body.replace(/^Всего:\s*\d+[^\n]*\n?/m, "");
  return body.trim();
}

export function formatStatsFallback(payload: StatsPromptPayload): string {
  return [
    `📊 Статистика · ${payload.mention}`,
    "",
    `Трезвость: ${payload.soberCurrent} (макс ${payload.soberMax})`,
    `Срыв: ${payload.intoxCurrent} (макс ${payload.intoxMax})`,
    `Всего: ${payload.totalSoberDays} трезвых / ${payload.totalSlipDays} срывных дней`,
  ].join("\n");
}
