# Services

## Purpose

Business logic: window lifecycle, check-ins, streaks, scheduling, LLM orchestration. Stateless functions taking `db` / Telegram `api`. Product rules: [`../../docs/SPEC.md`](../../docs/SPEC.md) §2, §4, §8.

## Ownership

| Module | Role |
|--------|------|
| `window.ts` | `openWindow` / `closeWindow` / `maybeCloseWindowIfComplete` |
| `scheduler.ts` | Per-chat cron (open) + setTimeout (close) + minute cron (pledge cleanup) |
| `members.ts` | Roster, `recordCheckin`, live LLM refresh trigger |
| `checkin-status.ts` | Prior-day status + grace-gated resolution |
| `streak.ts` | Dual sober/intox streaks, `detectTodayEvent` |
| `streak-quality.ts` | Pattern, quality, hollow milestones |
| `llm.ts` | OpenAI-compatible client; DeepSeek `thinking: disabled` |
| `llm-context.ts` | `buildLlmBaseContext()` + schedule block |
| `context-budget.ts` | `trimContextToBudget()` |
| `message-debounce.ts` | Telegram edits (`DEBOUNCE_MS`), LLM regen (`LLM_DEBOUNCE_MS`) |
| `summary.ts` | Close summary (reply to window message) |
| `window-message.ts` | Window body shape + footer |
| `milestone.ts`, `nudge.ts`, `momentum.ts`, `pledge.ts` | Retention hooks (SPEC §4.3) |
| `chat-snippets.ts`, `llm-generations.ts` | LLM context |
| `highlights.ts` | Live highlight helpers |
| `rules.ts` | Static `/rules` + welcome copy (`buildRulesText`) |
| `roster-lifecycle.ts` | Roster deactivate + early window close |

Only `SchedulerService` is a class.

## Local Contracts

**Window lifecycle:** `open` → answers (debounced edit + LLM regen) → `closed` (auto `minor_slip` for silent joined members) → `summarized`. One window per chat per calendar day (`checkin_date` = open day in chat TZ).

**LLM optional:** no `OPENAI_API_KEY` → static Russian text. LLM fail → keep prior body or `DEFAULT_QUESTION`. Never crash on LLM errors.

**Chat invariants** (SPEC §2.7): bot messages never deleted proactively; summary replies to window; close edits in place with «Окно закрыто.»

## Work Guidance

- Logic changes → SPEC §2 / §4 / §10 first; add unit tests under `tests/unit/`
- New service module → Appendix A in SPEC

## Verification

```bash
pnpm test:unit && pnpm test:integration
```

## Child DOX Index

(none)
