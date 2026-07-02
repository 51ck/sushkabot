import { describe, expect, test } from "bun:test";
import { resolveCheckinStatus } from "../../src/types.ts";

describe("resolveCheckinStatus", () => {
  test("krasavchik stays sober", () => {
    expect(resolveCheckinStatus("krasavchik", null, 0, 7)).toBe("sober");
    expect(resolveCheckinStatus("krasavchik", "minor_slip", 5, 7)).toBe("sober");
  });

  test("ostupilsya is minor when grace threshold met", () => {
    expect(resolveCheckinStatus("ostupilsya", null, 7, 7)).toBe("minor_slip");
    expect(resolveCheckinStatus("ostupilsya", "sober", 10, 7)).toBe("minor_slip");
    expect(resolveCheckinStatus("ostupilsya", null, 0, 0)).toBe("minor_slip");
  });

  test("ostupilsya is major when streak below grace threshold", () => {
    expect(resolveCheckinStatus("ostupilsya", null, 0, 7)).toBe("major_slip");
    expect(resolveCheckinStatus("ostupilsya", "sober", 6, 7)).toBe("major_slip");
  });

  test("ostupilsya escalates to major after prior slip", () => {
    expect(resolveCheckinStatus("ostupilsya", "minor_slip", 10, 7)).toBe("major_slip");
    expect(resolveCheckinStatus("ostupilsya", "major_slip", 10, 7)).toBe("major_slip");
  });
});
