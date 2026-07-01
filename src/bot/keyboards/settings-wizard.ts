import { InlineKeyboard } from "grammy";

export const SETTINGS_PREFIX = "set:";

export interface TimezoneCity {
  code: string;
  label: string;
  iana: string;
}

export interface TimezoneRegion {
  code: string;
  label: string;
  cities: TimezoneCity[];
}

export const TIMEZONE_REGIONS: TimezoneRegion[] = [
  {
    code: "europe",
    label: "Европа",
    cities: [
      { code: "moscow", label: "Москва", iana: "Europe/Moscow" },
      { code: "kyiv", label: "Киев", iana: "Europe/Kyiv" },
      { code: "london", label: "Лондон", iana: "Europe/London" },
      { code: "berlin", label: "Берлин", iana: "Europe/Berlin" },
      { code: "paris", label: "Париж", iana: "Europe/Paris" },
      { code: "istanbul", label: "Стамбул", iana: "Europe/Istanbul" },
    ],
  },
  {
    code: "americas",
    label: "Америка",
    cities: [
      { code: "ny", label: "Нью-Йорк", iana: "America/New_York" },
      { code: "chicago", label: "Чикаго", iana: "America/Chicago" },
      { code: "la", label: "Лос-Анджелес", iana: "America/Los_Angeles" },
      { code: "toronto", label: "Торонто", iana: "America/Toronto" },
      { code: "saopaulo", label: "Сан-Паулу", iana: "America/Sao_Paulo" },
    ],
  },
  {
    code: "asia",
    label: "Азия",
    cities: [
      { code: "dubai", label: "Дубай", iana: "Asia/Dubai" },
      { code: "tashkent", label: "Ташкент", iana: "Asia/Tashkent" },
      { code: "almaty", label: "Алматы", iana: "Asia/Almaty" },
      { code: "tokyo", label: "Токио", iana: "Asia/Tokyo" },
      { code: "singapore", label: "Сингапур", iana: "Asia/Singapore" },
    ],
  },
  {
    code: "pacific",
    label: "Тихий океан & UTC",
    cities: [
      { code: "utc", label: "UTC", iana: "UTC" },
      { code: "sydney", label: "Сидней", iana: "Australia/Sydney" },
      { code: "auckland", label: "Окленд", iana: "Pacific/Auckland" },
    ],
  },
];

export function findTimezoneCity(code: string): (TimezoneCity & { region: string }) | null {
  for (const region of TIMEZONE_REGIONS) {
    const city = region.cities.find((c) => c.code === code);
    if (city) return { ...city, region: region.code };
  }
  return null;
}

export function getTimezoneRegion(code: string): TimezoneRegion | undefined {
  return TIMEZONE_REGIONS.find((r) => r.code === code);
}

export function findTimezoneRegionForIana(iana: string): string | null {
  for (const region of TIMEZONE_REGIONS) {
    if (region.cities.some((c) => c.iana === iana)) return region.code;
  }
  return null;
}

export const DURATION_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: "1 час" },
  { minutes: 90, label: "90 мин" },
  { minutes: 120, label: "2 часа" },
  { minutes: 180, label: "3 часа" },
  { minutes: 240, label: "4 часа" },
];

export const HOUR_OPTIONS = [19, 20, 21, 22, 23] as const;
export const MINUTE_OPTIONS = [0, 15, 30, 45] as const;

export type WizardScreen = "menu" | "time" | "timezone" | "timezone_cities" | "duration";

export type SettingsCallback =
  | { type: "screen"; screen: WizardScreen }
  | { type: "hour"; hour: number }
  | { type: "minute"; minute: number }
  | { type: "timezone_region"; region: string }
  | { type: "timezone_city"; iana: string }
  | { type: "timezone_back" }
  | { type: "duration"; minutes: number }
  | { type: "nudge" }
  | { type: "save" }
  | { type: "back" }
  | { type: "cancel" };

export type DmTimezoneCallback =
  | { type: "region"; region: string }
  | { type: "city"; iana: string }
  | { type: "back" }
  | { type: "clear" };

export function parseSettingsCallback(data: string): SettingsCallback | null {
  if (!data.startsWith(SETTINGS_PREFIX)) return null;
  const body = data.slice(SETTINGS_PREFIX.length);

  if (body === "save") return { type: "save" };
  if (body === "back") return { type: "back" };
  if (body === "cancel") return { type: "cancel" };
  if (body === "tz_back") return { type: "timezone_back" };
  if (body === "nudge") return { type: "nudge" };

  const screenMatch = /^screen:(.+)$/.exec(body);
  if (screenMatch) {
    const screen = screenMatch[1] as WizardScreen;
    if (
      screen === "menu" ||
      screen === "time" ||
      screen === "timezone" ||
      screen === "timezone_cities" ||
      screen === "duration"
    ) {
      return { type: "screen", screen };
    }
  }

  const hourMatch = /^hour:(\d+)$/.exec(body);
  if (hourMatch) return { type: "hour", hour: Number.parseInt(hourMatch[1] ?? "", 10) };

  const minuteMatch = /^minute:(\d+)$/.exec(body);
  if (minuteMatch) return { type: "minute", minute: Number.parseInt(minuteMatch[1] ?? "", 10) };

  const tzRegionMatch = /^tzr:(.+)$/.exec(body);
  if (tzRegionMatch) {
    const region = tzRegionMatch[1] ?? "";
    if (getTimezoneRegion(region)) return { type: "timezone_region", region };
  }

  const tzCityMatch = /^tzc:(.+)$/.exec(body);
  if (tzCityMatch) {
    const city = findTimezoneCity(tzCityMatch[1] ?? "");
    if (city) return { type: "timezone_city", iana: city.iana };
  }

  const durMatch = /^dur:(\d+)$/.exec(body);
  if (durMatch) return { type: "duration", minutes: Number.parseInt(durMatch[1] ?? "", 10) };

  return null;
}

const DM_PREFIX = `${SETTINGS_PREFIX}dm:`;

export function parseDmTimezoneCallback(data: string): DmTimezoneCallback | null {
  if (!data.startsWith(DM_PREFIX)) return null;
  const body = data.slice(DM_PREFIX.length);

  if (body === "clear") return { type: "clear" };
  if (body === "tz_back") return { type: "back" };

  const tzRegionMatch = /^tzr:(.+)$/.exec(body);
  if (tzRegionMatch) {
    const region = tzRegionMatch[1] ?? "";
    if (getTimezoneRegion(region)) return { type: "region", region };
  }

  const tzCityMatch = /^tzc:(.+)$/.exec(body);
  if (tzCityMatch) {
    const city = findTimezoneCity(tzCityMatch[1] ?? "");
    if (city) return { type: "city", iana: city.iana };
  }

  return null;
}

function backButton(prefix = SETTINGS_PREFIX): InlineKeyboard {
  return new InlineKeyboard().text("← Назад", `${prefix}back`);
}

function timezoneBackButton(prefix = SETTINGS_PREFIX): InlineKeyboard {
  return new InlineKeyboard().text("← Регионы", `${prefix}tz_back`);
}

export function buildTimezoneRegionText(current: string): string {
  return [`🌍 Часовой пояс`, "", `Текущий: ${current}`, "", "Выбери регион."].join("\n");
}

export function buildTimezoneCityText(regionCode: string, current: string): string {
  const region = getTimezoneRegion(regionCode);
  const name = region?.label ?? regionCode;
  return [`🌍 ${name}`, "", `Текущий: ${current}`, "", "Выбери город."].join("\n");
}

export function buildTimezoneRegionKeyboard(
  current: string,
  prefix = SETTINGS_PREFIX,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const region of TIMEZONE_REGIONS) {
    const mark = findTimezoneRegionForIana(current) === region.code ? "• " : "";
    kb.text(`${mark}${region.label}`, `${prefix}tzr:${region.code}`).row();
  }
  if (prefix === SETTINGS_PREFIX) {
    return kb.append(backButton(prefix));
  }
  return kb;
}

export function buildTimezoneCityKeyboard(
  regionCode: string,
  current: string,
  prefix = SETTINGS_PREFIX,
): InlineKeyboard {
  const region = getTimezoneRegion(regionCode);
  const kb = new InlineKeyboard();
  if (region) {
    for (const city of region.cities) {
      const mark = city.iana === current ? "• " : "";
      kb.text(`${mark}${city.label}`, `${prefix}tzc:${city.code}`).row();
    }
  }
  return kb.append(timezoneBackButton(prefix));
}

export function buildDmTimezoneKeyboard(current: string | null): InlineKeyboard {
  const kb = buildTimezoneRegionKeyboard(current ?? "", DM_PREFIX);
  return kb.text("Сбросить", `${DM_PREFIX}clear`).row();
}

export function buildMenuKeyboard(showSave: boolean, nudgeEnabled = false): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("⏰ Время", `${SETTINGS_PREFIX}screen:time`)
    .text("🌍 Часовой пояс", `${SETTINGS_PREFIX}screen:timezone`)
    .row()
    .text("⏳ Длительность", `${SETTINGS_PREFIX}screen:duration`)
    .row()
    .text(`🔔 Напоминалка: ${nudgeEnabled ? "Вкл ✅" : "Выкл ❌"}`, `${SETTINGS_PREFIX}nudge`);

  if (showSave) {
    kb.row()
      .text("✅ Сохранить и включить", `${SETTINGS_PREFIX}save`)
      .text("✖ Отмена", `${SETTINGS_PREFIX}cancel`);
  } else {
    kb.row().text("✖ Закрыть", `${SETTINGS_PREFIX}cancel`);
  }

  return kb;
}

export function buildTimeKeyboard(hour: number, minute: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const h of HOUR_OPTIONS) {
    const mark = h === hour ? "• " : "";
    kb.text(`${mark}${h}:00`, `${SETTINGS_PREFIX}hour:${h}`);
  }
  kb.row();
  for (const m of MINUTE_OPTIONS) {
    const mark = m === minute ? "• " : "";
    const label = m === 0 ? `${mark}:00` : `${mark}:${String(m).padStart(2, "0")}`;
    kb.text(label, `${SETTINGS_PREFIX}minute:${m}`);
  }
  return kb.row().append(backButton());
}

export function buildDurationKeyboard(current: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const opt of DURATION_OPTIONS) {
    const mark = opt.minutes === current ? "• " : "";
    kb.text(`${mark}${opt.label}`, `${SETTINGS_PREFIX}dur:${opt.minutes}`).row();
  }
  return kb.append(backButton());
}
