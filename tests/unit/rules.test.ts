import { describe, expect, test } from "bun:test";
import { buildRulesText } from "../../src/services/rules.ts";

describe("buildRulesText", () => {
  test("lists two check-in buttons, not three", () => {
    const text = buildRulesText("21:00");
    expect(text).toContain("💪 Красавчик");
    expect(text).toContain("🍺 Оступился");
    expect(text).not.toContain("Пидорнулся");
    expect(text).toContain("две кнопки");
  });

  test("includes chat check-in time when provided", () => {
    expect(buildRulesText("21:30")).toContain("в 21:30");
    expect(buildRulesText()).not.toMatch(/в \d{1,2}:\d{2}/);
  });

  test("explains grace threshold", () => {
    expect(buildRulesText(undefined, 7)).toContain("≥ 7 дней трезвости");
    expect(buildRulesText(undefined, 0)).toContain("с первого дня");
  });

  test("mentions join before check-in", () => {
    expect(buildRulesText()).toContain("/join");
  });

  test("mentions auto-leave when leaving chat", () => {
    expect(buildRulesText()).toContain("Вышел из чата");
  });

  test("explains escalation", () => {
    const text = buildRulesText();
    expect(text).toContain("Повторный «Оступился» на следующий день");
  });
});
