import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const chats = sqliteTable(
  "chats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    telegramChatId: text("telegram_chat_id").notNull(),
    title: text("title").notNull().default(""),
    timezone: text("timezone").notNull().default("UTC"),
    checkinHour: integer("checkin_hour").notNull().default(21),
    checkinMinute: integer("checkin_minute").notNull().default(0),
    windowDurationMinutes: integer("window_duration_minutes").notNull().default(120),
    questionText: text("question_text").notNull().default("Оступился сегодня?"),
    responseMode: text("response_mode").notNull().default("sushka"),
    buttonLabels: text("button_labels"),
    nudgeEnabled: integer("nudge_enabled", { mode: "boolean" }).notNull().default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex("chats_telegram_chat_id_idx").on(table.telegramChatId)],
);

export const members = sqliteTable(
  "members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    telegramUserId: text("telegram_user_id").notNull(),
    username: text("username"),
    displayName: text("display_name").notNull(),
    timezoneOverride: text("timezone_override"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex("members_telegram_user_id_idx").on(table.telegramUserId)],
);

export const chatMembers = sqliteTable(
  "chat_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").notNull().default(sql`(datetime('now'))`),
    leftAt: text("left_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    uniqueIndex("chat_members_chat_member_idx").on(table.chatId, table.memberId),
    index("chat_members_chat_active_idx").on(table.chatId, table.active),
  ],
);

export const dailyWindows = sqliteTable(
  "daily_windows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    checkinDate: text("checkin_date").notNull(),
    messageId: integer("message_id"),
    windowOpensAt: text("window_opens_at").notNull(),
    windowClosesAt: text("window_closes_at").notNull(),
    status: text("status").notNull().default("open"),
    generatedBody: text("generated_body"),
    generatedSummaryIntro: text("generated_summary_intro"),
    liveBody: text("live_body"),
    liveBodyAt: text("live_body_at"),
  },
  (table) => [
    uniqueIndex("daily_windows_chat_date_idx").on(table.chatId, table.checkinDate),
    index("daily_windows_status_idx").on(table.status),
  ],
);

export const botPosts = sqliteTable(
  "bot_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    telegramMessageId: integer("telegram_message_id").notNull(),
    kind: text("kind").notNull(),
    dailyWindowId: integer("daily_window_id").references(() => dailyWindows.id, {
      onDelete: "set null",
    }),
    postedAt: text("posted_at").notNull().default(sql`(datetime('now'))`),
    hasReply: integer("has_reply", { mode: "boolean" }).notNull().default(false),
    hasReaction: integer("has_reaction", { mode: "boolean" }).notNull().default(false),
    deleteAfter: text("delete_after"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("bot_posts_chat_message_idx").on(table.chatId, table.telegramMessageId),
    index("bot_posts_chat_kind_idx").on(table.chatId, table.kind),
    index("bot_posts_delete_after_idx").on(table.deleteAfter),
  ],
);

export const chatSnippets = sqliteTable(
  "chat_snippets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    telegramMessageId: integer("telegram_message_id").notNull(),
    authorName: text("author_name").notNull(),
    text: text("text").notNull(),
    postedAt: text("posted_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [index("chat_snippets_chat_posted_idx").on(table.chatId, table.postedAt)],
);

export const llmGenerations = sqliteTable(
  "llm_generations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [index("llm_generations_chat_created_idx").on(table.chatId, table.createdAt)],
);

export const checkins = sqliteTable(
  "checkins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dailyWindowId: integer("daily_window_id")
      .notNull()
      .references(() => dailyWindows.id, { onDelete: "cascade" }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    checkinDate: text("checkin_date").notNull(),
    status: text("status").notNull(),
    note: text("note"),
    answeredAt: text("answered_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("checkins_window_member_idx").on(table.dailyWindowId, table.memberId),
    index("checkins_chat_date_idx").on(table.chatId, table.checkinDate),
  ],
);

export const chatsRelations = relations(chats, ({ many }) => ({
  chatMembers: many(chatMembers),
  dailyWindows: many(dailyWindows),
  checkins: many(checkins),
  botPosts: many(botPosts),
  chatSnippets: many(chatSnippets),
  llmGenerations: many(llmGenerations),
}));

export const membersRelations = relations(members, ({ many }) => ({
  chatMembers: many(chatMembers),
  checkins: many(checkins),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, { fields: [chatMembers.chatId], references: [chats.id] }),
  member: one(members, { fields: [chatMembers.memberId], references: [members.id] }),
}));

export const dailyWindowsRelations = relations(dailyWindows, ({ one, many }) => ({
  chat: one(chats, { fields: [dailyWindows.chatId], references: [chats.id] }),
  checkins: many(checkins),
}));

export const checkinsRelations = relations(checkins, ({ one }) => ({
  dailyWindow: one(dailyWindows, {
    fields: [checkins.dailyWindowId],
    references: [dailyWindows.id],
  }),
  chat: one(chats, { fields: [checkins.chatId], references: [chats.id] }),
  member: one(members, { fields: [checkins.memberId], references: [members.id] }),
}));

export const botPostsRelations = relations(botPosts, ({ one }) => ({
  chat: one(chats, { fields: [botPosts.chatId], references: [chats.id] }),
  dailyWindow: one(dailyWindows, {
    fields: [botPosts.dailyWindowId],
    references: [dailyWindows.id],
  }),
}));

export type Chat = typeof chats.$inferSelect;
export type Member = typeof members.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
export type DailyWindow = typeof dailyWindows.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type BotPost = typeof botPosts.$inferSelect;
export type ChatSnippet = typeof chatSnippets.$inferSelect;
export type LlmGeneration = typeof llmGenerations.$inferSelect;

export type BotPostKind = "window" | "summary" | "stats" | "command";
export type LlmGenerationKind = "open" | "live" | "summary" | "stats";
