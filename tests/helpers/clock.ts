import { DateTime, Settings } from "luxon";

export function fixedNow(iso: string): () => DateTime {
  Settings.now = () => DateTime.fromISO(iso, { zone: "utc" }).toMillis();
  return () => DateTime.utc();
}

export function resetClock(): void {
  Settings.now = () => Date.now();
}
