# Source

## Purpose

Sushkabot application: Telegram bot (grammY), business logic, SQLite persistence, optional LLM. Product rules: [`../docs/SPEC.md`](../docs/SPEC.md).

## Ownership

- Boot and wiring: `index.ts`, `env.ts`, `types.ts`, `texts.ts`
- Subtrees own handlers, services, schema, prompts (see Child DOX Index)

## Local Contracts

**Stack:** Bun 1.x, TypeScript 7 (`tsgo`), pnpm, grammY, Drizzle + `bun:sqlite`, croner, Luxon, optional OpenAI-compatible LLM.

**Boot** (`index.ts`): `createDatabase` → `runMigrations` → `initDb` → `createBot` → `scheduler.start()` → `registerBotCommands` → `bot.start()` (long polling).

**Layers:** `bot/` (Telegram) → `services/` (logic) → `db/` (persistence). `prompts/` for LLM text builders + `system.md`.

**Behavior changes:** update [`../docs/SPEC.md`](../docs/SPEC.md) first per [`../docs/AGENTS.md`](../docs/AGENTS.md), then code here.

**Style:** Biome — double quotes, semicolons, 2-space indent, 100 line width.

## Work Guidance

```bash
pnpm dev          # hot-reload (.env.development)
pnpm test         # all tests
pnpm db:generate  # after schema.ts change → commit drizzle/*.sql
```

Migrations auto-run on bot start (`src/db/migrate.ts`).

## Verification

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Child DOX Index

| Path | Owns |
|------|------|
| [`bot/AGENTS.md`](bot/AGENTS.md) | grammY factory, handlers, keyboards, callback prefixes |
| [`services/AGENTS.md`](services/AGENTS.md) | Window lifecycle, streaks, LLM context, scheduler |
| [`db/AGENTS.md`](db/AGENTS.md) | Drizzle schema, client, migrations |
| [`prompts/AGENTS.md`](prompts/AGENTS.md) | LLM system prompt + task builders |
