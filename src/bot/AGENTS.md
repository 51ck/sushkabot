# Bot (grammY)

## Purpose

Telegram transport: handler registration, inline keyboards, safe edits. Business rules live in `services/`; product contract in [`../../docs/SPEC.md`](../../docs/SPEC.md) §4–§5.

## Ownership

- `bot.ts` — factory, middleware (`db`, `scheduler` on context)
- `context.ts` — `BotContext` type
- `commands.ts` — `setMyCommands` menu
- `safe-edit.ts` — edit helpers (avoid Telegram errors)
- `handlers/` — update routing
- `keyboards/` — inline button layouts

## Local Contracts

**Handler registration order** (`bot.ts`) — order matters:

1. common → chat-log → reactions → setup-wizard → settings → checkin → dev → welcome

Chat-log before checkin (reply tracking on bot posts).

**Callback prefixes:**

| Prefix | Use |
|--------|-----|
| `checkin:` | `krasavchik`, `ostupilsya` |
| `set:` | Group settings wizard |
| `set:dm:` | DM timezone picker |

**Check-in statuses** (resolved in `services/checkin-status.ts`, types in `types.ts`): `sober`, `minor_slip`, `major_slip`. Legacy `slip`/`skipped` normalized at read.

**Roster:** `/join` / `/leave` in `handlers/common.ts`. Check-in requires active roster; early close via `maybeCloseWindowIfComplete` when all joined answered.

**Welcome:** `handlers/welcome.ts` — `/rules`, `new_chat_members`, `left_chat_member` (auto roster removal).

**Dev commands** (`handlers/dev.ts`): `/force_open`, `/force_close` only when `BOT_ENV=development`.

## Work Guidance

- Handlers call `services/`; keep Telegram I/O thin
- Handler tests: `tests/handlers/` via `bot.handleUpdate()` + API mocks
- UX/command changes → SPEC §4–§5 first

## Verification

```bash
pnpm test:handlers
```

## Child DOX Index

(none)
