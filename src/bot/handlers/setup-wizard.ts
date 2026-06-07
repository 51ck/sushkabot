import { eq } from "drizzle-orm";
import type { Bot, InlineKeyboard } from "grammy";
import { chats } from "../../db/schema.ts";
import { isAdmin } from "../../env.ts";
import { upsertChat } from "../../services/window.ts";
import { texts } from "../../texts.ts";
import { DEFAULT_QUESTION, type ResponseMode } from "../../types.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat, requireGroupAdmin } from "../context.ts";
import { safeEditMessageText } from "../safe-edit.ts";
import {
  buildDurationKeyboard,
  buildLabelsKeyboard,
  buildMenuKeyboard,
  buildPresetKeyboard,
  buildQuestionKeyboard,
  buildTimeKeyboard,
  buildTimezoneCityKeyboard,
  buildTimezoneCityText,
  buildTimezoneRegionKeyboard,
  buildTimezoneRegionText,
  parseSettingsCallback,
  SETTINGS_PREFIX,
  type WizardScreen,
} from "../keyboards/settings-wizard.ts";

export interface WizardDraft {
  checkinHour: number;
  checkinMinute: number;
  timezone: string;
  windowDurationMinutes: number;
  questionText: string;
  responseMode: ResponseMode;
  buttonLabels: string | null;
}

interface WizardSession {
  mode: "setup" | "config";
  screen: WizardScreen;
  timezoneRegion: string | null;
  messageId: number;
  telegramChatId: string;
  userId: number;
  dbChatId?: number;
  draft: WizardDraft;
}

const sessions = new Map<string, WizardSession>();

function sessionKey(telegramChatId: string, userId: number): string {
  return `${telegramChatId}:${userId}`;
}

function defaultDraft(): WizardDraft {
  return {
    checkinHour: 21,
    checkinMinute: 0,
    timezone: "Europe/Moscow",
    windowDurationMinutes: 120,
    questionText: DEFAULT_QUESTION,
    responseMode: "yes_no",
    buttonLabels: null,
  };
}

function draftFromChat(chat: typeof chats.$inferSelect): WizardDraft {
  return {
    checkinHour: chat.checkinHour,
    checkinMinute: chat.checkinMinute,
    timezone: chat.timezone,
    windowDurationMinutes: chat.windowDurationMinutes,
    questionText: chat.questionText,
    responseMode: chat.responseMode as ResponseMode,
    buttonLabels: chat.buttonLabels,
  };
}

function formatTime(draft: WizardDraft): string {
  return `${draft.checkinHour}:${String(draft.checkinMinute).padStart(2, "0")}`;
}

function presetLabel(mode: ResponseMode): string {
  switch (mode) {
    case "yes_no":
      return "Yes / No";
    case "yes_no_note":
      return "Yes / No + note";
    case "sober_slip_skip":
      return "Sober / Slip / Skip";
  }
}

function labelsSummary(draft: WizardDraft): string {
  return draft.buttonLabels ? "custom" : "defaults";
}

function buildMenuText(mode: "setup" | "config", draft: WizardDraft): string {
  const title = mode === "setup" ? "⚙️ Group setup" : "⚙️ Group settings";
  const hint =
    mode === "setup"
      ? "Tap a row to change it, then save when ready."
      : "Tap a row to change it. Changes save immediately.";

  return [
    title,
    "",
    hint,
    "",
    `⏰ Open time: ${formatTime(draft)}`,
    `🌍 Timezone: ${draft.timezone}`,
    `⏳ Window: ${draft.windowDurationMinutes} min`,
    `❓ Question: ${draft.questionText}`,
    `🔘 Buttons: ${presetLabel(draft.responseMode)}`,
    `🏷 Labels: ${labelsSummary(draft)}`,
  ].join("\n");
}

function buildScreenText(
  screen: WizardScreen,
  draft: WizardDraft,
  timezoneRegion: string | null,
): string {
  switch (screen) {
    case "time":
      return [
        `⏰ Check-in time`,
        "",
        `Current: ${formatTime(draft)}`,
        "",
        "Pick hour, then minutes.",
      ].join("\n");
    case "timezone":
      return buildTimezoneRegionText(draft.timezone);
    case "timezone_cities":
      return buildTimezoneCityText(timezoneRegion ?? "europe", draft.timezone);
    case "duration":
      return [
        `⏳ Answer window`,
        "",
        `Current: ${draft.windowDurationMinutes} min`,
        "",
        "How long members can answer after open.",
      ].join("\n");
    case "question":
      return [
        `❓ Check-in question`,
        "",
        `Current: ${draft.questionText}`,
        "",
        "Pick a question.",
      ].join("\n");
    case "preset":
      return [
        `🔘 Response buttons`,
        "",
        `Current: ${presetLabel(draft.responseMode)}`,
        "",
        "Defines streak logic (preset keys stay internal).",
      ].join("\n");
    case "labels":
      return [
        `🏷 Button labels`,
        "",
        `Current: ${labelsSummary(draft)}`,
        "",
        "Custom JSON labels can be added later; use defaults for now.",
      ].join("\n");
    default:
      return "";
  }
}

function buildScreenKeyboard(
  screen: WizardScreen,
  draft: WizardDraft,
  timezoneRegion: string | null,
): InlineKeyboard {
  switch (screen) {
    case "time":
      return buildTimeKeyboard(draft.checkinHour, draft.checkinMinute);
    case "timezone":
      return buildTimezoneRegionKeyboard(draft.timezone);
    case "timezone_cities":
      return buildTimezoneCityKeyboard(timezoneRegion ?? "europe", draft.timezone);
    case "duration":
      return buildDurationKeyboard(draft.windowDurationMinutes);
    case "question":
      return buildQuestionKeyboard(draft.questionText);
    case "preset":
      return buildPresetKeyboard(draft.responseMode);
    case "labels":
      return buildLabelsKeyboard();
    default:
      return buildMenuKeyboard(false);
  }
}

async function ensureAdmin(ctx: BotContext): Promise<boolean> {
  if (!isGroupChat(ctx)) {
    await ctx.reply(texts.notGroup);
    return false;
  }
  if (!ctx.from) return false;
  if (isAdmin(ctx.from.id) || (await requireGroupAdmin(ctx))) return true;
  await ctx.reply(texts.notAdmin);
  return false;
}

async function persistDraft(
  ctx: BotContext,
  session: WizardSession,
): Promise<typeof chats.$inferSelect> {
  const { draft, telegramChatId } = session;
  const title = ctx.chat && "title" in ctx.chat ? (ctx.chat.title ?? "") : "";

  if (session.mode === "setup" || !session.dbChatId) {
    const saved = await upsertChat(ctx.db, {
      telegramChatId,
      title,
      timezone: draft.timezone,
      checkinHour: draft.checkinHour,
      checkinMinute: draft.checkinMinute,
      windowDurationMinutes: draft.windowDurationMinutes,
      questionText: draft.questionText,
      responseMode: draft.responseMode,
      buttonLabels: draft.buttonLabels,
    });
    ctx.scheduler.registerChat(saved);
    session.dbChatId = saved.id;
    session.mode = "config";
    return saved;
  }

  const updated = await ctx.db
    .update(chats)
    .set({
      timezone: draft.timezone,
      checkinHour: draft.checkinHour,
      checkinMinute: draft.checkinMinute,
      windowDurationMinutes: draft.windowDurationMinutes,
      questionText: draft.questionText,
      responseMode: draft.responseMode,
      buttonLabels: draft.buttonLabels,
    })
    .where(eq(chats.id, session.dbChatId))
    .returning();
  const row = updated[0];
  if (!row) throw new Error("Failed to update chat settings");
  ctx.scheduler.registerChat(row);
  return row;
}

async function renderSession(ctx: BotContext, session: WizardSession): Promise<void> {
  const text =
    session.screen === "menu"
      ? buildMenuText(session.mode, session.draft)
      : buildScreenText(session.screen, session.draft, session.timezoneRegion);
  const keyboard =
    session.screen === "menu"
      ? buildMenuKeyboard(session.mode === "setup")
      : buildScreenKeyboard(session.screen, session.draft, session.timezoneRegion);

  await safeEditMessageText(ctx.api, Number(session.telegramChatId), session.messageId, text, {
    reply_markup: keyboard,
  });
}

async function startWizard(ctx: BotContext, mode: "setup" | "config"): Promise<void> {
  if (!(await ensureAdmin(ctx)) || !ctx.from || !ctx.chat) return;

  const telegramChatId = String(ctx.chat.id);
  let draft = defaultDraft();
  let dbChatId: number | undefined;

  if (mode === "config") {
    const chat = await ctx.db.query.chats.findFirst({
      where: eq(chats.telegramChatId, telegramChatId),
    });
    if (!chat) {
      await ctx.reply(texts.notConfigured);
      return;
    }
    draft = draftFromChat(chat);
    dbChatId = chat.id;
  }

  const text = buildMenuText(mode, draft);
  const message = await ctx.reply(text, {
    reply_markup: buildMenuKeyboard(mode === "setup"),
  });

  sessions.set(sessionKey(telegramChatId, ctx.from.id), {
    mode,
    screen: "menu",
    timezoneRegion: null,
    messageId: message.message_id,
    telegramChatId,
    userId: ctx.from.id,
    dbChatId,
    draft,
  });
}

async function applyFieldChange(
  ctx: BotContext,
  session: WizardSession,
  returnToMenu: boolean,
): Promise<void> {
  if (session.mode === "config") {
    await persistDraft(ctx, session);
  }

  if (returnToMenu) {
    session.screen = "menu";
  }

  await renderSession(ctx, session);
}

export function registerSetupWizardHandlers(bot: Bot<BotContext>): void {
  bot.command("setup", async (ctx) => startWizard(ctx, "setup"));
  bot.command("config", async (ctx) => startWizard(ctx, "config"));

  bot.callbackQuery(new RegExp(`^${SETTINGS_PREFIX}(?!dm:)`), async (ctx) => {
    const parsed = parseSettingsCallback(ctx.callbackQuery.data);
    if (!parsed || !ctx.from || !ctx.chat) return;

    const key = sessionKey(String(ctx.chat.id), ctx.from.id);
    const session = sessions.get(key);
    if (!session) {
      await ctx.answerCallbackQuery({ text: "Session expired. Run /setup or /config again." });
      return;
    }

    if (!(isAdmin(ctx.from.id) || (await requireGroupAdmin(ctx)))) {
      await ctx.answerCallbackQuery({ text: texts.notAdmin });
      return;
    }

    const messageId = ctx.callbackQuery.message?.message_id;
    if (messageId !== session.messageId) {
      await ctx.answerCallbackQuery({ text: "Use the latest settings message." });
      return;
    }

    switch (parsed.type) {
      case "screen":
        session.screen = parsed.screen;
        if (parsed.screen === "timezone") {
          session.timezoneRegion = null;
        }
        await renderSession(ctx, session);
        await ctx.answerCallbackQuery();
        return;

      case "timezone_region":
        session.timezoneRegion = parsed.region;
        session.screen = "timezone_cities";
        await renderSession(ctx, session);
        await ctx.answerCallbackQuery();
        return;

      case "timezone_city":
        session.draft.timezone = parsed.iana;
        session.timezoneRegion = null;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery({ text: parsed.iana });
        return;

      case "timezone_back":
        session.screen = "timezone";
        session.timezoneRegion = null;
        await renderSession(ctx, session);
        await ctx.answerCallbackQuery();
        return;

      case "hour":
        session.draft.checkinHour = parsed.hour;
        await applyFieldChange(ctx, session, false);
        await ctx.answerCallbackQuery({ text: `Time: ${formatTime(session.draft)}` });
        return;

      case "minute":
        session.draft.checkinMinute = parsed.minute;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery({ text: `Time: ${formatTime(session.draft)}` });
        return;

      case "duration":
        session.draft.windowDurationMinutes = parsed.minutes;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery({ text: `${parsed.minutes} min` });
        return;

      case "question":
        session.draft.questionText = parsed.text;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery();
        return;

      case "preset":
        session.draft.responseMode = parsed.mode;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery({ text: presetLabel(parsed.mode) });
        return;

      case "labels_clear":
        session.draft.buttonLabels = null;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery({ text: "Default labels" });
        return;

      case "back":
        session.screen = "menu";
        session.timezoneRegion = null;
        await renderSession(ctx, session);
        await ctx.answerCallbackQuery();
        return;

      case "cancel":
        sessions.delete(key);
        await ctx.api.editMessageText(
          Number(session.telegramChatId),
          session.messageId,
          session.mode === "setup" ? "Setup cancelled." : "Settings closed.",
        );
        await ctx.answerCallbackQuery();
        return;

      case "save":
        if (session.mode !== "setup") {
          await ctx.answerCallbackQuery({ text: "Already saved." });
          return;
        }
        await persistDraft(ctx, session);
        sessions.delete(key);
        await ctx.api.editMessageText(
          Number(session.telegramChatId),
          session.messageId,
          [
            texts.setupDone,
            "",
            `⏰ ${formatTime(session.draft)} ${session.draft.timezone}`,
            `⏳ ${session.draft.windowDurationMinutes} min window`,
            `❓ ${session.draft.questionText}`,
          ].join("\n"),
        );
        await ctx.answerCallbackQuery({ text: "Saved ✅" });
        return;
    }
  });
}
