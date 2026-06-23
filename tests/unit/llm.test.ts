import { describe, expect, test } from "bun:test";
import { extractCompletionText, normalizeApiBase } from "../../src/services/llm.ts";

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
