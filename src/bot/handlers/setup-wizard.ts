import { eq } from "drizzle-orm";
import type { Bot, InlineKeyboard } from "grammy";
import { chats } from "../../db/schema.ts";
import { isAdmin } from "../../env.ts";
import { upsertChat } from "../../services/window.ts";
import { texts } from "../../texts.ts";
import { DEFAULT_GRACE_MIN_SOBER_DAYS, formatGraceMinSoberDays } from "../../types.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat, requireGroupAdmin } from "../context.ts";
import {
  buildDurationKeyboard,
  buildGraceKeyboard,
  buildMenuKeyboard,
  buildTimeKeyboard,
  buildTimezoneCityKeyboard,
  buildTimezoneCityText,
  buildTimezoneRegionKeyboard,
  buildTimezoneRegionText,
  parseSettingsCallback,
  SETTINGS_PREFIX,
  type WizardScreen,
} from "../keyboards/settings-wizard.ts";
import { safeEditMessageText } from "../safe-edit.ts";

export interface WizardDraft {
  checkinHour: number;
  checkinMinute: number;
  timezone: string;
  windowDurationMinutes: number;
  nudgeEnabled: boolean;
  graceMinSoberDays: number;
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
    nudgeEnabled: false,
    graceMinSoberDays: DEFAULT_GRACE_MIN_SOBER_DAYS,
  };
}

function draftFromChat(chat: typeof chats.$inferSelect): WizardDraft {
  return {
    checkinHour: chat.checkinHour,
    checkinMinute: chat.checkinMinute,
    timezone: chat.timezone,
    windowDurationMinutes: chat.windowDurationMinutes,
    nudgeEnabled: chat.nudgeEnabled,
    graceMinSoberDays: chat.graceMinSoberDays,
  };
}

function formatTime(draft: WizardDraft): string {
  return `${draft.checkinHour}:${String(draft.checkinMinute).padStart(2, "0")}`;
}

function buildMenuText(mode: "setup" | "config", draft: WizardDraft): string {
  const title = mode === "setup" ? "⚙️ Настройка группы" : "⚙️ Настройки группы";
  const hint =
    mode === "setup" ? "Выбери параметры и нажми «Сохранить»." : "Изменения сохраняются сразу.";

  return [
    title,
    "",
    hint,
    "",
    `⏰ Время: ${formatTime(draft)}`,
    `🌍 Часовой пояс: ${draft.timezone}`,
    `⏳ Окно ответа: ${draft.windowDurationMinutes} мин`,
    `🛡 Грейс: от ${formatGraceMinSoberDays(draft.graceMinSoberDays)} трезвости`,
    `🔔 Напоминалка: ${draft.nudgeEnabled ? "Вкл ✅" : "Выкл ❌"}`,
    "",
    "Вопрос и кнопки фиксированы: «Оступился сегодня?» + Красавчик / Оступился",
  ].join("\n");
}

function buildSettingsSummaryLines(draft: WizardDraft): string[] {
  return [
    `⏰ ${formatTime(draft)} ${draft.timezone}`,
    `⏳ окно ${draft.windowDurationMinutes} мин`,
    `🛡 грейс от ${formatGraceMinSoberDays(draft.graceMinSoberDays)}`,
    `🔔 напоминалка ${draft.nudgeEnabled ? "вкл" : "выкл"}`,
  ];
}

function buildSettingsCloseText(mode: "setup" | "config", draft: WizardDraft): string {
  if (mode === "setup") {
    return "Настройка отменена.";
  }
  return ["Настройки:", "", ...buildSettingsSummaryLines(draft)].join("\n");
}

function buildScreenText(
  screen: WizardScreen,
  draft: WizardDraft,
  timezoneRegion: string | null,
): string {
  switch (screen) {
    case "time":
      return [
        `⏰ Время чек-ина`,
        "",
        `Сейчас: ${formatTime(draft)}`,
        "",
        "Выбери час и минуты.",
      ].join("\n");
    case "timezone":
      return buildTimezoneRegionText(draft.timezone);
    case "timezone_cities":
      return buildTimezoneCityText(timezoneRegion ?? "europe", draft.timezone);
    case "duration":
      return [
        `⏳ Окно ответа`,
        "",
        `Сейчас: ${draft.windowDurationMinutes} мин`,
        "",
        "Сколько времени можно ответить после открытия.",
      ].join("\n");
    case "grace":
      return [
        `🛡 Грейс`,
        "",
        `Сейчас: от ${formatGraceMinSoberDays(draft.graceMinSoberDays)} трезвости`,
        "",
        "Сколько дней подряд нужно быть трезвым, чтобы первый срыв не сбил серию.",
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
    case "grace":
      return buildGraceKeyboard(draft.graceMinSoberDays);
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
      nudgeEnabled: draft.nudgeEnabled,
      graceMinSoberDays: draft.graceMinSoberDays,
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
      nudgeEnabled: draft.nudgeEnabled,
      graceMinSoberDays: draft.graceMinSoberDays,
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
      ? buildMenuKeyboard(session.mode === "setup", session.draft.nudgeEnabled)
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
      await ctx.answerCallbackQuery({ text: "Сессия истекла. Запусти /setup или /config снова." });
      return;
    }

    if (!(isAdmin(ctx.from.id) || (await requireGroupAdmin(ctx)))) {
      await ctx.answerCallbackQuery({ text: texts.notAdmin });
      return;
    }

    const messageId = ctx.callbackQuery.message?.message_id;
    if (messageId !== session.messageId) {
      await ctx.answerCallbackQuery({ text: "Используй последнее сообщение настроек." });
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
        await ctx.answerCallbackQuery({ text: `Время: ${formatTime(session.draft)}` });
        return;

      case "minute":
        session.draft.checkinMinute = parsed.minute;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery({ text: `Время: ${formatTime(session.draft)}` });
        return;

      case "duration":
        session.draft.windowDurationMinutes = parsed.minutes;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery({ text: `${parsed.minutes} мин` });
        return;

      case "grace":
        session.draft.graceMinSoberDays = parsed.days;
        await applyFieldChange(ctx, session, true);
        await ctx.answerCallbackQuery({
          text: `Грейс: от ${formatGraceMinSoberDays(parsed.days)}`,
        });
        return;

      case "nudge":
        session.draft.nudgeEnabled = !session.draft.nudgeEnabled;
        await applyFieldChange(ctx, session, false);
        await ctx.answerCallbackQuery({
          text: session.draft.nudgeEnabled ? "Напоминалка включена" : "Напоминалка выключена",
        });
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
          buildSettingsCloseText(session.mode, session.draft),
        );
        await ctx.answerCallbackQuery();
        return;

      case "save":
        if (session.mode !== "setup") {
          await ctx.answerCallbackQuery({ text: "Уже сохранено." });
          return;
        }
        await persistDraft(ctx, session);
        sessions.delete(key);
        await ctx.api.editMessageText(
          Number(session.telegramChatId),
          session.messageId,
          [texts.setupDone, "", ...buildSettingsSummaryLines(session.draft)].join("\n"),
        );
        await ctx.answerCallbackQuery({ text: "Сохранено ✅" });
        return;
    }
  });
}
