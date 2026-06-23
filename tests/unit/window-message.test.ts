import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import type { Chat } from "../../src/db/schema.ts";
import {
  buildWindowMessage,
  computeCheckinDate,
  computeWindowClose,
  formatCountdown,
  sanitizeWindowBody,
} from "../../src/services/window-message.ts";

const baseChat: Chat = {
  id: 1,
  telegramChatId: "-100123",
  title: "Test",
  timezone: "Europe/Moscow",
  checkinHour: 23,
  checkinMinute: 0,
  windowDurationMinutes: 120,
  questionText: "FALLBACK_BODY",
  responseMode: "sushka",
  buttonLabels: null,
  nudgeEnabled: false,
  enabled: true,
  createdAt: "2026-01-01",
};

const openParams = {
  chat: baseChat,
  checkinDate: "2026-05-26",
  answeredCount: 3,
  joinedCount: 7,
  closesAt: DateTime.fromISO("2026-05-27T01:00:00", { zone: "Europe/Moscow" }),
  now: DateTime.fromISO("2026-05-26T23:00:00", { zone: "Europe/Moscow" }),
};

describe("window math", () => {
  test("close crosses midnight", () => {
    const openAt = DateTime.fromISO("2026-05-26T20:00:00Z");
    const closes = computeWindowClose(openAt, 120);
    expect(closes.toISO()).toBe(openAt.plus({ minutes: 120 }).toISO());
  });

  test("checkin date uses open day", () => {
    const openAt = DateTime.fromISO("2026-05-26T23:00:00", { zone: "Europe/Moscow" });
    expect(computeCheckinDate(openAt)).toBe("2026-05-26");
  });

  test("formatCountdown shows hours and minutes in Russian", () => {
    const closes = DateTime.fromISO("2026-05-27T01:00:00Z");
    const now = DateTime.fromISO("2026-05-26T23:00:00Z");
    expect(formatCountdown(closes, now)).toBe("2ч 0м");
  });
});

describe("buildWindowMessage structure", () => {
  test("open message: body first, footer counter, no date header line", () => {
    const body = "LLM_BODY_MARKER";
    const { text, replyMarkup } = buildWindowMessage({ ...openParams, generatedBody: body });

    const lines = text.split("\n");
    expect(lines[0]).toBe(body);
    expect(lines.some((l) => l.startsWith("🌙"))).toBe(false);
    expect(text).toMatch(/⏱.*3\/7 ответили/);
    expect(replyMarkup).toBeDefined();
  });

  test("falls back to chat.questionText when no generated body", () => {
    const { text } = buildWindowMessage(openParams);
    expect(text.startsWith("FALLBACK_BODY")).toBe(true);
  });

  test("closed message has no keyboard and replaces footer", () => {
    const { text, replyMarkup } = buildWindowMessage({
      ...openParams,
      now: DateTime.fromISO("2026-05-27T02:00:00Z"),
      closed: true,
      generatedBody: "LLM_BODY_MARKER",
    });

    expect(text).toMatch(/^LLM_BODY_MARKER\n\nОкно закрыто\.$/);
    expect(text).not.toMatch(/⏱.*ответили/);
    expect(replyMarkup).toBeUndefined();
  });
});

describe("sanitizeWindowBody", () => {
  test("strips echoed template chrome, keeps body", () => {
    const raw = "🌙 Сушка · 23 июня\n\nBODY_KEEP\n\n⏱ до 21:00 (2ч) · 1/2 ответили";
    expect(sanitizeWindowBody(raw)).toBe("BODY_KEEP");
  });
});
