# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

## DOX + Spec First

Read [`AGENTS.md`](AGENTS.md) DOX chain before editing. Behavior changes: update [`docs/SPEC.md`](docs/SPEC.md) first per [`docs/AGENTS.md`](docs/AGENTS.md), then implement. Closeout: sync SPEC + nearest `AGENTS.md` if contracts changed.

## Project

Sushkabot — Telegram group sobriety check-ins. Evening reminders + inline buttons, deadline windows, live LLM progress regen, daily summaries + dual streaks. Russian UI. SQLite, stateless runtime.

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
`createDatabase` → `runMigrations` → `initDb` → `createBot` → `scheduler.start()` → `registerBotCommands` → `bot.start()` (long polling)

### Key layers

- **`src/bot/`** — grammY factory, handlers, keyboards. `BotContext` extends grammY; `db` + `scheduler` via middleware.
- **`src/services/`** — business logic. Functions take `db`/`api`. No classes except `SchedulerService`. Key:
  - `window.ts` — `openWindow`/`closeWindow`, stale post cleanup on open
  - `scheduler.ts` — per-chat cron (open) + setTimeout (close) + minute cron (expired post cleanup)
  - `members.ts` — roster, `recordCheckin`, live LLM refresh trigger
  - `streak.ts` — dual sober/intox streaks from checkin history
  - `llm.ts` — OpenAI-compatible HTTP client, DeepSeek thinking disabled
  - `llm-context.ts` — shared context (chat snippets + roster + style examples) for all LLM calls
  - `message-debounce.ts` — debounce: Telegram edits (2s), LLM regen (6s)
- **`src/prompts/`** — LLM prompts: open, live, summary, stats
- **`src/db/`** — Drizzle schema, client factory, migrations. Telegram IDs as `text`.
- **`drizzle/`** — sequential SQL migrations (auto on start)

### Handler registration order matters
`src/bot/bot.ts`: common → chat-log → setup-wizard → settings → checkin → chat-reply → dev. Chat-log before checkin for snippet logging.

### Callback data prefixes
- `checkin:` — button taps (`krasavchik`, `ostupilsya`)
- `set:` — group settings wizard
- `set:dm:` — DM timezone picker

### Check-in status model
Three: `sober`, `minor_slip`, `major_slip`. Legacy `slip`/`skipped` normalized at read via `normalizeCheckinStatus` in `src/types.ts`. "Оступился" after yesterday slip → `major_slip`.

### LLM is optional
No `OPENAI_API_KEY` → static Russian text. LLM fail → keep prior body or `DEFAULT_QUESTION`. Never crash on LLM errors.

### Window lifecycle
`open` → answers (debounced edit + LLM regen) → `closed` (auto `minor_slip` for silent) → `summarized`. One window/chat/calendar day. `checkin_date` = calendar day window **opened** in chat TZ.

## Testing

`bun:test`. `tests/setup.ts` sets env incl `DATABASE_PATH=:memory:`. Integration: in-memory SQLite. Handlers: `bot.handleUpdate()` + API mocks, no real Telegram.

Fixtures: `tests/fixtures/`. Helpers: `tests/helpers/` (clock mock, DB setup).

## Migrations

`drizzle/*.sql` auto on start (`runMigrations` in `src/db/migrate.ts` from `src/index.ts`). Schema change in `src/db/schema.ts` → `pnpm db:generate`.

## Development setup

1. Copy `.env.development.example` → `.env.development`
2. Set `BOT_TOKEN` (@BotFather) + `ADMIN_USER_IDS`
3. `corepack enable && pnpm install && pnpm dev`
4. Add bot to private supergroup as admin, Privacy Mode off
5. `/setup` in group, `/force_open` to test without cron

## Deploy

Push `master` → lint+typecheck+test → Docker build → GHCR push → SSH deploy VPS. Container pulls only. Compose: parent `.env` + `data/` volume for SQLite.
