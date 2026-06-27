import { describe, expect, test } from "bun:test";
import {
  buildLlmRequestPayload,
  extractCompletionText,
  normalizeApiBase,
  sanitizeStatsBody,
} from "../../src/services/llm.ts";

describe("normalizeApiBase", () => {
  test("appends /v1 when missing", () => {
    expect(normalizeApiBase("https://api.deepseek.com")).toBe("https://api.deepseek.com/v1");
  });

  test("keeps existing /v1 suffix", () => {
    expect(normalizeApiBase("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
  });
});

describe("extractCompletionText", () => {
  test("returns trimmed content", () => {
    const text = extractCompletionText({
      choices: [{ message: { content: "  Привет, чат!  " }, finish_reason: "stop" }],
    });
    expect(text).toBe("Привет, чат!");
  });

  test("returns null when content empty after reasoning budget", () => {
    const text = extractCompletionText({
      choices: [
        {
          message: { content: "", reasoning_content: "thinking..." },
          finish_reason: "length",
        },
      ],
    });
    expect(text).toBeNull();
  });
});

describe("sanitizeStatsBody", () => {
  test("strips old template header and numeric lines", () => {
    const raw = [
      "📊 Статистика · @alice",
      "",
      "Трезвость: 0 (макс 2)",
      "Срыв: 0 (макс 1)",
      "Всего: 3 трезвых / 2 срывных дней",
      "",
      "LLM_BODY_KEEP",
    ].join("\n");
    expect(sanitizeStatsBody(raw)).toBe("LLM_BODY_KEEP");
  });
});

describe("buildLlmRequestPayload", () => {
  test("sends top-level thinking disabled for DeepSeek", () => {
    const payload = buildLlmRequestPayload(
      [{ role: "user", content: "hi" }],
      "https://api.deepseek.com/v1",
    );
    expect(payload.thinking).toEqual({ type: "disabled" });
    expect(payload.extra_body).toBeUndefined();
  });

  test("uses max_tokens for DeepSeek", () => {
    const payload = buildLlmRequestPayload(
      [{ role: "user", content: "hi" }],
      "https://api.deepseek.com/v1",
    );
    expect(payload.max_tokens).toBe(1024);
    expect(payload.max_completion_tokens).toBeUndefined();
  });

  test("omits thinking for non-DeepSeek APIs", () => {
    const payload = buildLlmRequestPayload(
      [{ role: "user", content: "hi" }],
      "https://api.openai.com/v1",
    );
    expect(payload.thinking).toBeUndefined();
  });

  test("uses max_completion_tokens for non-DeepSeek APIs", () => {
    const payload = buildLlmRequestPayload(
      [{ role: "user", content: "hi" }],
      "https://api.openai.com/v1",
    );
    expect(payload.max_completion_tokens).toBe(1024);
    expect(payload.max_tokens).toBeUndefined();
  });
});
