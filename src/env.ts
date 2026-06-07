import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    BOT_ENV: z.enum(["development", "production"]).default("production"),
    BOT_TOKEN: z.string().min(1),
    ADMIN_USER_IDS: z
      .string()
      .transform((s) =>
        s
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => Number.parseInt(id, 10)),
      )
      .pipe(z.array(z.number().int().positive())),
    DATABASE_PATH: z.string().default("./data/sushkobot.db"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export function isDevEnv(): boolean {
  return env.BOT_ENV === "development";
}

export function isAdmin(userId: number): boolean {
  return env.ADMIN_USER_IDS.includes(userId);
}
