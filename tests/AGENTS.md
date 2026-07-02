# Tests

## Purpose

Verification for Sushkabot. Behavior expectations come from [`../docs/SPEC.md`](../docs/SPEC.md); run via `bun:test`.

## Ownership

- `setup.ts` — env defaults (`DATABASE_PATH=:memory:`)
- `unit/` — pure logic (streaks, status, LLM context, env)
- `integration/` — in-memory SQLite flows
- `handlers/` — grammY handlers with mocked Telegram API
- `helpers/` — clock mock, DB setup
- `fixtures/` — sample Telegram updates

## Local Contracts

| Tier | Command | Scope |
|------|---------|-------|
| All | `pnpm test` | everything |
| Unit | `pnpm test:unit` | `tests/unit/` |
| Integration | `pnpm test:integration` | `tests/integration/` |
| Handlers | `pnpm test:handlers` | `tests/handlers/` |

Single file: `bun test tests/unit/streak.test.ts`

**New behavior:** add or extend tests in the tier that matches the change; integration for DB flows, handlers for Telegram routing.

## Work Guidance

- Spec-first for behavior changes; tests assert SPEC edge cases (§10)
- Do not add tests that only mirror implementation with no product meaning

## Verification

```bash
pnpm test
```

## Child DOX Index

(none)
