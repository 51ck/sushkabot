import { and, desc, eq } from "drizzle-orm";
import type { Api } from "grammy";
import type { AppDatabase } from "../db/client.ts";
import type { Chat } from "../db/schema.ts";
import { dailyWindows } from "../db/schema.ts";
import { isActiveChatMember, leaveChatMember } from "./members.ts";
import type { SchedulerService } from "./scheduler.ts";
import { maybeCloseWindowIfComplete } from "./window.ts";

/** Remove member from roster; if open window, try early close. Returns whether they were active. */
export async function deactivateRosterMember(params: {
  db: AppDatabase;
  api: Api;
  chat: Chat;
  memberId: number;
  scheduler?: SchedulerService;
}): Promise<boolean> {
  const { db, api, chat, memberId, scheduler } = params;

  if (!(await isActiveChatMember(db, chat.id, memberId))) {
    return false;
  }

  await leaveChatMember(db, chat.id, memberId);

  const window = await db.query.dailyWindows.findFirst({
    where: and(eq(dailyWindows.chatId, chat.id), eq(dailyWindows.status, "open")),
    orderBy: desc(dailyWindows.id),
  });

  if (window) {
    await maybeCloseWindowIfComplete({ db, api, chat, window, scheduler });
  }

  return true;
}
