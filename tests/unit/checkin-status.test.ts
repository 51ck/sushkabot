import { describe, expect, test } from "bun:test";
import { resolveCheckinStatus } from "../../src/types.ts";

describe("resolveCheckinStatus", () => {
  test("krasavchik stays sober", () => {
    expect(resolveCheckinStatus("krasavchik", null)).toBe("sober");
    expect(resolveCheckinStatus("krasavchik", "minor_slip")).toBe("sober");
  });

  test("ostupilsya is minor when prior day was clean", () => {
    expect(resolveCheckinStatus("ostupilsya", null)).toBe("minor_slip");
    expect(resolveCheckinStatus("ostupilsya", "sober")).toBe("minor_slip");
  });

  test("ostupilsya escalates to major after prior slip", () => {
    expect(resolveCheckinStatus("ostupilsya", "minor_slip")).toBe("major_slip");
    expect(resolveCheckinStatus("ostupilsya", "major_slip")).toBe("major_slip");
  });
});
