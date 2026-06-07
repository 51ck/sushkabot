import { describe, expect, test } from "bun:test";
import { z } from "zod";

describe("env validation shape", () => {
  test("requires BOT_TOKEN", () => {
    const schema = z.object({
      BOT_TOKEN: z.string().min(1),
      ADMIN_USER_IDS: z.string(),
    });
    const result = schema.safeParse({ ADMIN_USER_IDS: "123" });
    expect(result.success).toBe(false);
  });

  test("parses admin ids", () => {
    const schema = z.object({
      ADMIN_USER_IDS: z
        .string()
        .transform((s) => s.split(",").map((id) => Number.parseInt(id.trim(), 10))),
    });
    const result = schema.parse({ ADMIN_USER_IDS: "1, 2, 3" });
    expect(result.ADMIN_USER_IDS).toEqual([1, 2, 3]);
  });
});
