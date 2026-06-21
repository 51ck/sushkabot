import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import type { Chat } from "../../src/db/schema.ts";
import {
  buildWindowMessage,
  computeCheckinDate,
  computeWindowClose,
  formatCountdown,
} from "../../src/services/window-message.ts";

const baseChat: Chat = {
  id: 1,
  telegramChatId: "-100123",
  title: "Test",
  timezone: "Europe/Moscow",
  checkinHour: 23,
  checkinMinute: 0,
  windowDurationMinutes: 120,
  questionText: "Оступился? Пидорнулся?",
  responseMode: "sushka",
  buttonLabels: null,
  nudgeEnabled: false,
  enabled: true,
  createdAt: "2026-01-01",
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

describe("buildWindowMessage", () => {
  test("includes progress counter", () => {
    const { text } = buildWindowMessage({
      chat: baseChat,
      checkinDate: "2026-05-26",
      answeredCount: 3,
      joinedCount: 7,
      closesAt: DateTime.fromISO("2026-05-27T01:00:00", { zone: "Europe/Moscow" }),
      now: DateTime.fromISO("2026-05-26T23:00:00", { zone: "Europe/Moscow" }),
    });
    expect(text).toContain("3/7 ответили");
    expect(text).toContain("Оступился? Пидорнулся?");
    expect(text).toContain("🌙 Сушка");
  });

  test("uses generated body when provided", () => {
    const { text } = buildWindowMessage({
      chat: baseChat,
      checkinDate: "2026-05-26",
      answeredCount: 1,
      joinedCount: 2,
      closesAt: DateTime.fromISO("2026-05-27T01:00:00Z"),
      now: DateTime.fromISO("2026-05-26T23:00:00Z"),
      generatedBody: "Ну что, честно?",
    });
    expect(text).toContain("Ну что, честно?");
  });

  test("closed message has no keyboard", () => {
    const { text, replyMarkup } = buildWindowMessage({
      chat: baseChat,
      checkinDate: "2026-05-26",
      answeredCount: 1,
      joinedCount: 2,
      closesAt: DateTime.fromISO("2026-05-27T01:00:00Z"),
      now: DateTime.fromISO("2026-05-27T02:00:00Z"),
      closed: true,
    });
    expect(text).toContain("Окно закрыто");
    expect(replyMarkup).toBeUndefined();
  });
});
