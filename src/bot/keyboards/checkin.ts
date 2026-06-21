import { InlineKeyboard } from "grammy";
import {
  CHECKIN_BUTTON_KEYS,
  type CheckinButtonKey,
  DEFAULT_BUTTON_LABELS,
  isCheckinButtonKey,
} from "../../types.ts";

export function buildCheckinKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const key of CHECKIN_BUTTON_KEYS) {
    keyboard.text(DEFAULT_BUTTON_LABELS[key], `checkin:${key}`);
  }
  return keyboard;
}

export function parseCheckinCallback(data: string): CheckinButtonKey | null {
  if (!data.startsWith("checkin:")) return null;
  const key = data.slice("checkin:".length);
  return isCheckinButtonKey(key) ? key : null;
}
