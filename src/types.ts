import { z } from "zod";

export const responseModeSchema = z.enum(["yes_no", "yes_no_note", "sober_slip_skip"]);
export type ResponseMode = z.infer<typeof responseModeSchema>;

export const checkinStatusSchema = z.enum(["sober", "slip", "skipped"]);
export type CheckinStatus = z.infer<typeof checkinStatusSchema>;

export const windowStatusSchema = z.enum(["open", "closed", "summarized"]);
export type WindowStatus = z.infer<typeof windowStatusSchema>;

export const buttonLabelsSchema = z.record(z.string(), z.string());
export type ButtonLabels = z.infer<typeof buttonLabelsSchema>;

export type PresetButtonKey = "yes" | "no" | "sober" | "slip" | "skip";

export const DEFAULT_BUTTON_LABELS: Record<ResponseMode, Record<string, string>> = {
  yes_no: { yes: "✅ Yes", no: "❌ No" },
  yes_no_note: { yes: "✅ Yes", no: "❌ No" },
  sober_slip_skip: { sober: "✅ Sober", slip: "❌ Slip", skip: "⏭ Skip" },
};

export const DEFAULT_QUESTION = "Was you sober today?";

export const PRESET_BUTTON_KEYS: Record<ResponseMode, PresetButtonKey[]> = {
  yes_no: ["yes", "no"],
  yes_no_note: ["yes", "no"],
  sober_slip_skip: ["sober", "slip", "skip"],
};

export function presetKeyToStatus(mode: ResponseMode, key: PresetButtonKey): CheckinStatus {
  if (mode === "sober_slip_skip") {
    if (key === "sober") return "sober";
    if (key === "slip") return "slip";
    return "skipped";
  }
  return key === "yes" ? "sober" : "slip";
}

export function getButtonLabels(
  mode: ResponseMode,
  custom: Record<string, string> | null | undefined,
): Record<string, string> {
  const defaults = DEFAULT_BUTTON_LABELS[mode];
  if (!custom) return defaults;
  return { ...defaults, ...custom };
}

export function parseButtonLabels(json: string | null | undefined): Record<string, string> | null {
  if (!json) return null;
  const parsed: unknown = JSON.parse(json);
  const result = buttonLabelsSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function statusToEmoji(status: CheckinStatus): string {
  switch (status) {
    case "sober":
      return "✅";
    case "slip":
      return "❌";
    case "skipped":
      return "⏭";
  }
}
