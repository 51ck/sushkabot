import { DateTime, Settings } from "luxon";

export function fixedNow(iso: string): () => DateTime {
  const millis = Date.parse(iso);
  if (Number.isNaN(millis)) throw new Error(`invalid ISO date: ${iso}`);
  Settings.now = () => millis;
  return () => DateTime.utc();
}

export function resetClock(): void {
  Settings.now = () => Date.now();
}
