import { z } from "zod";

/** Fixed check-in button set for all chats. */
export const CHECKIN_BUTTON_KEYS = ["krasavchik", "ostupilsya", "pidornulsya"] as const;
export type CheckinButtonKey = (typeof CHECKIN_BUTTON_KEYS)[number];

export const checkinStatusSchema = z.enum(["sober", "minor_slip", "major_slip"]);
export type CheckinStatus = z.infer<typeof checkinStatusSchema>;

/** Legacy values still present in older rows. */
export type LegacyCheckinStatus = CheckinStatus | "slip" | "skipped";

export const windowStatusSchema = z.enum(["open", "closed", "summarized"]);
export type WindowStatus = z.infer<typeof windowStatusSchema>;

export const DEFAULT_QUESTION = "Оступился? Пидорнулся?";

export const DEFAULT_BUTTON_LABELS: Record<CheckinButtonKey, string> = {
  krasavchik: "💪 Красавчик",
  ostupilsya: "🍺 Оступился",
  pidornulsya: "💥 Пидорнулся",
};

export function isCheckinButtonKey(key: string): key is CheckinButtonKey {
  return (CHECKIN_BUTTON_KEYS as readonly string[]).includes(key);
}

export function buttonKeyToBaseStatus(key: CheckinButtonKey): CheckinStatus {
  switch (key) {
    case "krasavchik":
      return "sober";
    case "ostupilsya":
      return "minor_slip";
    case "pidornulsya":
      return "major_slip";
  }
}

export function normalizeCheckinStatus(status: string): CheckinStatus {
  switch (status) {
    case "sober":
      return "sober";
    case "minor_slip":
      return "minor_slip";
    case "major_slip":
      return "major_slip";
    case "slip":
      return "major_slip";
    case "skipped":
      return "minor_slip";
    default:
      return "major_slip";
  }
}

/** Previous-day slip statuses escalate a new «Оступился» tap to «Пидорнулся». */
export function isEscalatingPriorStatus(status: CheckinStatus | null): boolean {
  if (!status) return false;
  return status === "minor_slip" || status === "major_slip";
}

export function resolveCheckinStatus(
  buttonKey: CheckinButtonKey,
  previousDayStatus: CheckinStatus | null,
): CheckinStatus {
  if (buttonKey === "ostupilsya" && isEscalatingPriorStatus(previousDayStatus)) {
    return "major_slip";
  }
  return buttonKeyToBaseStatus(buttonKey);
}

export function statusToEmoji(status: CheckinStatus | LegacyCheckinStatus): string {
  switch (normalizeCheckinStatus(status)) {
    case "sober":
      return "💪";
    case "minor_slip":
      return "🍺";
    case "major_slip":
      return "💥";
  }
}

export function statusToLabel(status: CheckinStatus | LegacyCheckinStatus): string {
  switch (normalizeCheckinStatus(status)) {
    case "sober":
      return "красавчик";
    case "minor_slip":
      return "оступился";
    case "major_slip":
      return "пидорнулся";
  }
}
