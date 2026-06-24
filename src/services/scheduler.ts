import { Cron } from "croner";
import { eq } from "drizzle-orm";
import type { Api, Bot } from "grammy";
import { DateTime } from "luxon";
import type { AppDatabase } from "../db/client.ts";
import { type Chat, chats, type DailyWindow, dailyWindows } from "../db/schema.ts";
import { cleanupExpiredBotPosts } from "./bot-posts.ts";
import { sendNudge } from "./nudge.ts";
import { cleanupOldPledges } from "./pledge.ts";
import { closeWindow, openWindow, recoverStaleWindows } from "./window.ts";

type CloseTimer = ReturnType<typeof setTimeout>;

export class SchedulerService {
  private openCrons = new Map<number, Cron>();
  private closeTimers = new Map<number, CloseTimer>();
  private nudgeTimers = new Map<number, CloseTimer>();
  private maintenanceCron: Cron | null = null;

  constructor(
    private db: AppDatabase,
    private getApi: () => Api,
  ) {}

  async start(): Promise<void> {
    await recoverStaleWindows({
      db: this.db,
      api: this.getApi(),
      scheduler: this,
    });

    const enabledChats = await this.db.query.chats.findMany({
      where: eq(chats.enabled, true),
    });

    for (const chat of enabledChats) {
      this.registerChat(chat);
    }

    this.maintenanceCron = new Cron("* * * * *", { protect: true }, async () => {
      await cleanupExpiredBotPosts({ db: this.db, api: this.getApi() });
      cleanupOldPledges(DateTime.utc().toISODate() ?? "");
    });
  }

  registerChat(chat: Chat): void {
    this.unregisterChat(chat.id);

    const pattern = `${chat.checkinMinute} ${chat.checkinHour} * * *`;
    const cron = new Cron(pattern, { timezone: chat.timezone, protect: true }, async () => {
      const fresh = await this.db.query.chats.findFirst({
        where: eq(chats.id, chat.id),
      });
      if (!fresh?.enabled) return;
      await openWindow({
        db: this.db,
        api: this.getApi(),
        chat: fresh,
        scheduler: this,
      });
    });

    this.openCrons.set(chat.id, cron);
  }

  unregisterChat(chatId: number): void {
    const cron = this.openCrons.get(chatId);
    if (cron) {
      cron.stop();
      this.openCrons.delete(chatId);
    }
    const timer = this.closeTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.closeTimers.delete(chatId);
    }
    const nudge = this.nudgeTimers.get(chatId);
    if (nudge) {
      clearTimeout(nudge);
      this.nudgeTimers.delete(chatId);
    }
  }

  scheduleClose(chat: Chat, window: DailyWindow): void {
    const existing = this.closeTimers.get(chat.id);
    if (existing) clearTimeout(existing);

    const closesAt = DateTime.fromISO(window.windowClosesAt, { zone: "utc" });
    const now = DateTime.utc();
    const delayMs = Math.max(0, closesAt.toMillis() - now.toMillis());

    const timer = setTimeout(async () => {
      this.closeTimers.delete(chat.id);
      const freshWindow = await this.db.query.dailyWindows.findFirst({
        where: eq(dailyWindows.id, window.id),
      });
      const freshChat = await this.db.query.chats.findFirst({
        where: eq(chats.id, chat.id),
      });
      if (!freshWindow || !freshChat || freshWindow.status !== "open") return;
      await closeWindow({
        db: this.db,
        api: this.getApi(),
        chat: freshChat,
        window: freshWindow,
      });
    }, delayMs);

    this.closeTimers.set(chat.id, timer);

    if (chat.nudgeEnabled) {
      const existingNudge = this.nudgeTimers.get(chat.id);
      if (existingNudge) clearTimeout(existingNudge);

      const nudgeDelayMs = Math.max(0, Math.floor(delayMs / 2));
      const nudgeTimer = setTimeout(async () => {
        this.nudgeTimers.delete(chat.id);
        try {
          const freshWindow = await this.db.query.dailyWindows.findFirst({
            where: eq(dailyWindows.id, window.id),
          });
          const freshChat = await this.db.query.chats.findFirst({
            where: eq(chats.id, chat.id),
          });
          if (!freshWindow || !freshChat || freshWindow.status !== "open") return;
          if (!freshChat.nudgeEnabled) return;
          await sendNudge({
            db: this.db,
            api: this.getApi(),
            chat: freshChat,
            window: freshWindow,
          });
        } catch (err) {
          console.error(`Nudge failed for chat ${chat.id}:`, err);
        }
      }, nudgeDelayMs);

      this.nudgeTimers.set(chat.id, nudgeTimer);
    }
  }

  stop(): void {
    for (const chatId of this.openCrons.keys()) {
      this.unregisterChat(chatId);
    }
    if (this.maintenanceCron) {
      this.maintenanceCron.stop();
      this.maintenanceCron = null;
    }
  }
}

export function createScheduler(db: AppDatabase, bot: Bot): SchedulerService {
  return new SchedulerService(db, () => bot.api);
}
