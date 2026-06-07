import type { Context } from "grammy";
import type { AppDatabase } from "../db/client.ts";
import type { SchedulerService } from "../services/scheduler.ts";

export type BotContext = Context & {
  db: AppDatabase;
  scheduler: SchedulerService;
};

export function displayNameFromUser(user: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return "User";
}

export function isGroupChat(ctx: BotContext): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

export async function requireGroupAdmin(ctx: BotContext): Promise<boolean> {
  if (!isGroupChat(ctx) || !ctx.from) return false;
  const member = await ctx.getChatMember(ctx.from.id);
  return member.status === "creator" || member.status === "administrator";
}
