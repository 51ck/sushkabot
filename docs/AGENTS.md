# Docs

## Purpose

Product contract and ops docs. **Behavior source of truth:** [`SPEC.md`](SPEC.md). Changelog: [`changelog/SPEC.md`](changelog/SPEC.md). Deploy: [`DEPLOY.md`](DEPLOY.md). Backlog: [`IDEAS.md`](IDEAS.md).

## Ownership

- `SPEC.md` — what the bot does (flows, commands, LLM, schema, env, edge cases)
- `DEPLOY.md` — CI/CD, VPS, Docker (behavior stays in SPEC)
- `changelog/SPEC.md` — version history when SPEC scope warrants a bump
- `IDEAS.md` — future ideas; not binding until promoted to SPEC

## Local Contracts

**Spec first** for any change to product behavior, user flows, commands, LLM prompts, data model, or env/config semantics:

1. Edit `SPEC.md` (version note if scope warrants)
2. Implement in `src/` + `drizzle/` + `tests/`
3. Keep in sync — drift mid-task → fix spec or code

**Skip SPEC update only when:** pure refactor (zero behavior change), typo/formatting in non-spec files, user explicitly says spec later.

### SPEC touch checklist

| Change type | SPEC sections |
|-------------|---------------|
| Scope | §3 in/out |
| UX / flows | §4 |
| Commands | §5 |
| LLM / copy | §6 (+ `src/prompts/system.md` if system prompt) |
| Schema | §7 (+ Appendix A if new modules) |
| Scheduling | §8 |
| Env vars | §9 |
| Edge cases | §10 |
| New source files | Appendix A |

### Example

```
BAD:  add closeWindow delete logic → commit → maybe update SPEC
GOOD: SPEC §4.2 + edge case row → then window.ts + tests
```

Do **not** duplicate SPEC content in AGENTS.md — link sections instead.

## Work Guidance

- LLM system prompt text lives in [`../src/prompts/system.md`](../src/prompts/system.md); SPEC §6 describes kinds and context blocks
- Deploy script changes must stay aligned with `DEPLOY.md`
- Promote `IDEAS.md` items to SPEC §3 before implementing

## Verification

- `pnpm lint && pnpm typecheck && pnpm test` before merge (CI enforces on PR)

## Child DOX Index

| Path | Owns |
|------|------|
| [`../deploy/AGENTS.md`](../deploy/AGENTS.md) | VPS bootstrap scripts (see `DEPLOY.md`) |
