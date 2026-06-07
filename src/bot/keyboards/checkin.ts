import { InlineKeyboard } from "grammy";
import { PRESET_BUTTON_KEYS, type PresetButtonKey, type ResponseMode } from "../../types.ts";

export function buildCheckinKeyboard(
  mode: ResponseMode,
  labels: Record<string, string>,
): InlineKeyboard {
  const keys = PRESET_BUTTON_KEYS[mode];
  const keyboard = new InlineKeyboard();
  for (const key of keys) {
    const label = labels[key] ?? key;
    keyboard.text(label, `checkin:${key}`);
  }
  return keyboard;
}

export function parseCheckinCallback(data: string): PresetButtonKey | null {
  if (!data.startsWith("checkin:")) return null;
  const key = data.slice("checkin:".length) as PresetButtonKey;
  return key;
}
