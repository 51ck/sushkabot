# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Sushkabot — Telegram bot for group sobriety check-ins. Evening reminders with inline buttons, deadline windows, live LLM-regenerated progress messages, and daily summaries with dual streak tracking. Russian language UI. SQLite-backed, stateless runtime.

## Commands

```bash
pnpm dev                    # Run with hot-reload (uses .env.development)
pnpm start                  # Production start
pnpm test                   # All tests (bun:test)
pnpm test:unit              # Unit tests only
pnpm test:integration       # Integration tests (in-memory SQLite)
pnpm test:handlers          # Handler tests (mocked Telegram API)
bun test tests/unit/streak.test.ts  # Single test file
pnpm lint                   # Biome check
pnpm lint:fix               # Biome auto-fix
pnpm typecheck              # tsgo --noEmit (TypeScript 7 native)
pnpm db:generate            # Generate Drizzle migration SQL
pnpm db:migrate             # Run migrations manually (auto-runs on bot start)
```

## Stack

- **Runtime:** Bun 1.x
- **Language:** TypeScript 7 (`tsgo` native compiler)
- **Package manager:** pnpm 11.2.1 (`corepack enable`)
- **Bot framework:** grammY (long polling, inline keyboards)
- **Database:** SQLite via Drizzle ORM + `bun:sqlite`
- **Scheduler:** croner (cron) + setTimeout (window close)
- **Dates:** Luxon with IANA timezones and Russian locale
- **LLM:** Optional OpenAI-compatible API (DeepSeek, OpenAI, etc.)
- **Lint/format:** Biome (double quotes, semicolons, 2-space indent, 100 line width)
- **Env validation:** Zod + `@t3-oss/env-core` (`src/env.ts`)

## Architecture

### Boot sequence (`src/index.ts`)
`createDatabase` → `runMigrations` → `initDb` → `createBot` → `scheduler.start()` → `registerBotCommands` → `bot.start()` (long polling with reactions in `allowed_updates`)

### Key layers

- **`src/bot/`** — grammY bot factory, handler registration, keyboards. Context (`BotContext`) extends grammY with `db` and `scheduler` injected via middleware.
- **`src/services/`** — business logic. Each service is a set of functions taking `db` and `api` as needed. No classes except `SchedulerService`. Key services:
  - `window.ts` — `openWindow`/`closeWindow`, stale post cleanup on open
  - `scheduler.ts` — per-chat cron (open) + setTimeout (close) + minute cron (expired post cleanup)
  - `members.ts` — roster, `recordCheckin`, live LLM refresh trigger
  - `streak.ts` — dual sober/intox streak calculation from checkin history
  - `llm.ts` — OpenAI-compatible HTTP client, DeepSeek thinking disabled
  - `llm-context.ts` — shared context builder (chat snippets + roster + style examples) for all LLM calls
  - `message-debounce.ts` — separate debounce timers for Telegram edits (2s) and LLM regen (6s)
- **`src/prompts/`** — LLM system/user prompts for open, live, summary, stats
- **`src/db/`** — Drizzle schema, client factory, migration runner. Telegram IDs stored as `text`.
- **`drizzle/`** — Sequential SQL migration files (applied automatically on start)

### Handler registration order matters
In `src/bot/bot.ts`: common → chat-log → reactions → setup-wizard → settings → checkin → dev. Chat-log must register before checkin to capture reply tracking.

### Callback data prefixes
- `checkin:` — check-in button taps (`krasavchik`, `ostupilsya`, `pidornulsya`)
- `set:` — group settings wizard callbacks
- `set:dm:` — DM timezone picker callbacks

### Check-in status model
Three statuses: `sober`, `minor_slip`, `major_slip`. Legacy DB values `slip`/`skipped` normalized at read time via `normalizeCheckinStatus` in `src/types.ts`. "Оступился" after yesterday's slip escalates to `major_slip`.

### LLM is optional
When `OPENAI_API_KEY` is unset, all LLM paths fall back to static Russian text. LLM failures keep previous body or use `DEFAULT_QUESTION`. Bot never crashes on LLM errors.

### Window lifecycle
`open` → answers (debounced edit + LLM regen) → `closed` (auto minor_slip for silent members) → `summarized`. One window per chat per calendar day. `checkin_date` = calendar day when window **opened** in chat timezone.

## Testing

Tests use `bun:test`. Test setup in `tests/setup.ts` sets env defaults including `DATABASE_PATH=:memory:`. Integration tests use real in-memory SQLite. Handler tests use `bot.handleUpdate()` with API transformer mocks — no real Telegram calls.

Test fixtures live in `tests/fixtures/`. Helper utilities in `tests/helpers/` (clock mocking, DB setup).

## Migrations

Migrations in `drizzle/*.sql` run automatically on bot start (`runMigrations` in `src/db/migrate.ts` called from `src/index.ts`). After adding schema changes to `src/db/schema.ts`, run `pnpm db:generate` to create a new migration file.

## Development setup

1. Copy `.env.development.example` to `.env.development`
2. Set `BOT_TOKEN` (from @BotFather) and `ADMIN_USER_IDS`
3. `corepack enable && pnpm install && pnpm dev`
4. Add bot to a private supergroup as admin with Privacy Mode off
5. `/setup` in group, then `/force_open` to test without waiting for cron

## Deploy

Push to `master` triggers: lint+typecheck+test → Docker build → GHCR push → SSH deploy to VPS. Container pulls only (no build on server). Compose uses parent `.env` + `data/` volume for SQLite persistence.
