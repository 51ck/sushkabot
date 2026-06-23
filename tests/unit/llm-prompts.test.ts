import { describe, expect, test } from "bun:test";
import { buildLiveWindowUserPrompt, buildStatsUserPrompt } from "../../src/prompts/live-window.ts";
import { buildCheckinUserPrompt, buildSummaryUserPrompt } from "../../src/prompts/messages.ts";
import type { WindowHighlightContext } from "../../src/services/highlights.ts";
import { formatHighlightsBlock, formatStatsBlock } from "../../src/services/highlights.ts";
import type { LlmBaseContext } from "../../src/services/llm-context.ts";

const baseLlmContext: LlmBaseContext = {
  styleExamples: [{ kind: "live", text: "prior generation sample" }],
  chatSnippets: [{ authorName: "@alice", text: "chat line one" }],
  participants: [
    {
      mention: "@alice",
      soberCurrent: 5,
      soberMax: 10,
      intoxCurrent: 0,
      intoxMax: 2,
      totalSoberDays: 20,
      totalSlipDays: 3,
    },
    {
      mention: "@bob",
      soberCurrent: 0,
      soberMax: 7,
      intoxCurrent: 2,
      intoxMax: 4,
      totalSoberDays: 15,
      totalSlipDays: 8,
    },
  ],
};

const liveContext: WindowHighlightContext = {
  ...baseLlmContext,
  checkinDate: "2026-06-23",
  answeredCount: 1,
  joinedCount: 2,
  closesAt: "2026-06-23T21:00:00.000Z",
  mode: "full",
  highlights: [
    {
      mention: "@alice",
      status: "sober",
      statusLabel: "красавчик",
      soberStreakBefore: 4,
      intoxStreakBefore: 0,
      soberStreakAfter: 5,
      intoxStreakAfter: 0,
      event: "extended_sober",
    },
  ],
};

function expectSharedSections(prompt: string): void {
  expect(prompt).toContain("## Примеры прошлых генераций");
  expect(prompt).toContain("prior generation sample");
  expect(prompt).toContain("## Недавний чат");
  expect(prompt).toContain("@alice: chat line one");
  expect(prompt).toContain("## Участники");
  expect(prompt).toContain("@bob");
  expect(prompt).toContain('"sober": 5');
}

describe("buildCheckinUserPrompt", () => {
  test("includes shared context and open-window counts", () => {
    const prompt = buildCheckinUserPrompt({
      ...baseLlmContext,
      date: "2026-06-23",
      answeredCount: 0,
      joinedCount: 2,
    });

    expectSharedSections(prompt);
    expect(prompt).toContain("## Сегодня");
    expect(prompt).toContain("date: 2026-06-23");
    expect(prompt).toContain("answered: 0/2");
  });
});

describe("buildLiveWindowUserPrompt", () => {
  test("includes highlights with mention, status, and streak delta", () => {
    const prompt = buildLiveWindowUserPrompt(liveContext);

    expectSharedSections(prompt);
    expect(prompt).toContain("## Сегодня");
    expect(prompt).toContain("answered: 1/2");
    expect(prompt).toContain("mode: full");
    expect(prompt).toContain("## Ответы сегодня (highlights)");
    expect(prompt).toContain("@alice");
    expect(prompt).toContain("красавчик");
    expect(prompt).toContain("трезвость 4→5");
    expect(prompt).toContain("event=extended_sober");
  });

  test("empty highlights placeholder when nobody answered", () => {
    const prompt = buildLiveWindowUserPrompt({ ...liveContext, highlights: [] });
    expect(prompt).toContain("(пока никто не ответил)");
  });
});

describe("buildSummaryUserPrompt", () => {
  test("includes day aggregates for summary generation", () => {
    const prompt = buildSummaryUserPrompt({
      ...baseLlmContext,
      date: "2026-06-23",
      answeredCount: 2,
      joinedCount: 2,
      soberCount: 1,
      minorSlipCount: 1,
      majorSlipCount: 0,
    });

    expectSharedSections(prompt);
    expect(prompt).toContain("## Итоги дня");
    expect(prompt).toContain("красавчики: 1");
    expect(prompt).toContain("оступились: 1");
    expect(prompt).toContain("пидорнулись: 0");
  });
});

describe("formatHighlightsBlock", () => {
  test("renders structured highlight lines for LLM", () => {
    const block = formatHighlightsBlock(liveContext.highlights);
    expect(block).toMatch(/^- @alice: красавчик, трезвость 4→5, event=extended_sober$/);
  });
});

const statsPayload = {
  mention: "@alice",
  asOfDate: "2026-06-23",
  soberCurrent: 0,
  soberMax: 2,
  intoxCurrent: 0,
  intoxMax: 1,
  totalSoberDays: 3,
  totalSlipDays: 2,
  recentDays: [
    { date: "2026-06-20", status: "красавчик" },
    { date: "2026-06-21", status: "оступился" },
  ],
};

describe("buildStatsUserPrompt", () => {
  test("includes readable stats block and shared context", () => {
    const prompt = buildStatsUserPrompt({ ...baseLlmContext, statsPayload });

    expectSharedSections(prompt);
    expect(prompt).toContain("## Статистика");
    expect(prompt).toContain("Участник: @alice");
    expect(prompt).toContain("Стрик трезвости: 0 (макс 2)");
    expect(prompt).toContain("2026-06-20: красавчик");
    expect(prompt).not.toContain('"soberCurrent"');
  });
});

describe("formatStatsBlock", () => {
  test("placeholder when no recent check-ins", () => {
    expect(formatStatsBlock({ ...statsPayload, recentDays: [] })).toContain(
      "(нет отметок за 7 дней)",
    );
  });
});
