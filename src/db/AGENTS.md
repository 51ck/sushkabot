# Database

## Purpose

SQLite persistence via Drizzle ORM + `bun:sqlite`. Schema contract: [`../../docs/SPEC.md`](../../docs/SPEC.md) §7.

## Ownership

- `schema.ts` — table definitions (Telegram IDs as `text`)
- `client.ts` — `createDatabase`, `AppDatabase` type
- `migrate.ts` — run `drizzle/*.sql` (auto on bot start from `index.ts`)
- `../drizzle/*.sql` — sequential migrations (sibling to `src/`)

## Local Contracts

**Core tables:** `chats`, `members`, `chat_members`, `daily_windows`, `checkins`, `bot_posts`, `chat_snippets`, `llm_generations`.

**`checkins.status`:** `sober` | `minor_slip` | `major_slip`

**`daily_windows.status`:** `open` → `closed` → `summarized`

One check-in per member per window. Unique `(chat_id, checkin_date)` per window.

## Work Guidance

1. Update SPEC §7 (+ §10 edge cases if needed)
2. Edit `schema.ts`
3. `pnpm db:generate` → commit new `drizzle/*.sql`
4. Migrations apply on next bot start (or `pnpm db:migrate`)

## Verification

```bash
pnpm test:integration   # in-memory SQLite
pnpm db:migrate         # manual check
```

## Child DOX Index

(none)
