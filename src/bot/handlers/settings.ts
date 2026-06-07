import { eq } from "drizzle-orm";
import type { Bot } from "grammy";
import { members } from "../../db/schema.ts";
import { texts } from "../../texts.ts";
import type { BotContext } from "../context.ts";
import {
  buildDmTimezoneKeyboard,
  buildTimezoneCityKeyboard,
  buildTimezoneCityText,
  parseDmTimezoneCallback,
  SETTINGS_PREFIX,
} from "../keyboards/settings-wizard.ts";
import { safeEditMessageText } from "../safe-edit.ts";

const DM_PREFIX = `${SETTINGS_PREFIX}dm:`;

interface DmTimezoneSession {
  messageId: number;
  timezoneRegion: string | null;
}

const dmSessions = new Map<number, DmTimezoneSession>();

function dmTimezoneHeader(current: string | null): string[] {
  const tz = current ?? "not set";
  return [
    `🌍 Personal timezone`,
    "",
    `Current: ${tz}`,
    "",
    "Used for display (scheduling is per-group).",
  ];
}

export function registerSettingsHandlers(bot: Bot<BotContext>): void {
  bot.command("settings", async (ctx) => {
    if (ctx.chat?.type !== "private" || !ctx.from) {
      await ctx.reply(texts.settingsDmOnly);
      return;
    }

    const current = await ctx.db.query.members.findFirst({
      where: eq(members.telegramUserId, String(ctx.from.id)),
    });

    const message = await ctx.reply(
      [...dmTimezoneHeader(current?.timezoneOverride ?? null), "", "Pick a region."].join("\n"),
      { reply_markup: buildDmTimezoneKeyboard(current?.timezoneOverride ?? null) },
    );

    dmSessions.set(ctx.from.id, { messageId: message.message_id, timezoneRegion: null });
  });

  bot.callbackQuery(new RegExp(`^${DM_PREFIX}`), async (ctx) => {
    if (ctx.chat?.type !== "private" || !ctx.from) return;

    const parsed = parseDmTimezoneCallback(ctx.callbackQuery.data);
    if (!parsed) return;

    const session = dmSessions.get(ctx.from.id);
    const messageId = ctx.callbackQuery.message?.message_id;
    if (!session || messageId !== session.messageId) {
      await ctx.answerCallbackQuery({ text: "Run /settings again." });
      return;
    }

    if (parsed.type === "clear") {
      const member = await ensureMemberRow(ctx);
      if (!member) return;
      await ctx.db.update(members).set({ timezoneOverride: null }).where(eq(members.id, member.id));
      session.timezoneRegion = null;
      await safeEditMessageText(
        ctx.api,
        ctx.chat.id,
        session.messageId,
        [...dmTimezoneHeader(null), "", "Cleared. Pick a region to set a new one."].join("\n"),
        { reply_markup: buildDmTimezoneKeyboard(null) },
      );
      await ctx.answerCallbackQuery({ text: texts.settingsCleared });
      return;
    }

    const member = await ensureMemberRow(ctx);
    if (!member) return;

    const currentTz = member.timezoneOverride;

    if (parsed.type === "back") {
      session.timezoneRegion = null;
      await safeEditMessageText(
        ctx.api,
        ctx.chat.id,
        session.messageId,
        [...dmTimezoneHeader(currentTz), "", "Pick a region."].join("\n"),
        { reply_markup: buildDmTimezoneKeyboard(currentTz) },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    if (parsed.type === "region") {
      session.timezoneRegion = parsed.region;
      await safeEditMessageText(
        ctx.api,
        ctx.chat.id,
        session.messageId,
        buildTimezoneCityText(parsed.region, currentTz ?? ""),
        { reply_markup: buildTimezoneCityKeyboard(parsed.region, currentTz ?? "", DM_PREFIX) },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    if (parsed.type === "city") {
      await ctx.db
        .update(members)
        .set({ timezoneOverride: parsed.iana })
        .where(eq(members.id, member.id));

      session.timezoneRegion = null;
      await safeEditMessageText(
        ctx.api,
        ctx.chat.id,
        session.messageId,
        [...dmTimezoneHeader(parsed.iana), "", "Saved. Pick a region to change."].join("\n"),
        { reply_markup: buildDmTimezoneKeyboard(parsed.iana) },
      );
      await ctx.answerCallbackQuery({ text: texts.settingsSaved });
    }
  });

  bot.command("settimezone", async (ctx) => {
    if (ctx.chat?.type !== "private") {
      await ctx.reply(texts.settingsDmOnly);
      return;
    }
    await ctx.reply("Use /settings — timezone is picked with buttons now.");
  });
}

async function ensureMemberRow(ctx: BotContext) {
  if (!ctx.from) return null;

  let member = await ctx.db.query.members.findFirst({
    where: eq(members.telegramUserId, String(ctx.from.id)),
  });

  if (!member) {
    const inserted = await ctx.db
      .insert(members)
      .values({
        telegramUserId: String(ctx.from.id),
        username: ctx.from.username ?? null,
        displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "User",
        timezoneOverride: null,
      })
      .returning();
    member = inserted[0];
  }

  return member ?? null;
}
