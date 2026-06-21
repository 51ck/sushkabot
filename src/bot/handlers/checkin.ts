import type { Bot } from "grammy";
import { DateTime } from "luxon";
import {
  ensureMember,
  getChatByTelegramId,
  joinChatMember,
  recordCheckin,
} from "../../services/members.ts";
import { texts } from "../../texts.ts";
import type { CheckinStatus } from "../../types.ts";
import type { BotContext } from "../context.ts";
import { isGroupChat } from "../context.ts";
import { parseCheckinCallback } from "../keyboards/checkin.ts";

function toastForStatus(status: CheckinStatus): string {
  switch (status) {
    case "sober":
      return texts.checkinSober;
    case "minor_slip":
      return texts.checkinMinorSlip;
    case "major_slip":
      return texts.checkinMajorSlip;
  }
}

export function registerCheckinHandlers(bot: Bot<BotContext>): void {
  bot.on("callback_query:data", async (ctx) => {
    const key = parseCheckinCallback(ctx.callbackQuery.data);
    if (!key) return;

    if (!ctx.from || !ctx.chat || !isGroupChat(ctx)) {
      await ctx.answerCallbackQuery({ text: texts.checkinClosed });
      return;
    }

    const chat = await getChatByTelegramId(ctx.db, String(ctx.chat.id));
    if (!chat) {
      await ctx.answerCallbackQuery({ text: texts.notConfigured });
      return;
    }

    const window = await ctx.db.query.dailyWindows.findFirst({
      where: (w, { and, eq }) => and(eq(w.chatId, chat.id), eq(w.status, "open")),
      orderBy: (w, { desc }) => desc(w.id),
    });

    if (!window || window.status !== "open") {
      await ctx.answerCallbackQuery({ text: texts.checkinClosed });
      return;
    }

    const closesAt = DateTime.fromISO(window.windowClosesAt, { zone: "utc" });
    if (DateTime.utc() >= closesAt) {
      await ctx.answerCallbackQuery({ text: texts.checkinClosed });
      return;
    }

    const { memberId } = await ensureMember(ctx.db, ctx.from);
    await joinChatMember(ctx.db, chat.id, memberId);

    const status = await recordCheckin({
      db: ctx.db,
      api: ctx.api,
      chat,
      window,
      memberId,
      buttonKey: key,
    });

    await ctx.answerCallbackQuery({ text: toastForStatus(status) });
  });
}
