# DOX framework

DOX is a hierarchy of `AGENTS.md` work contracts. Agent must follow DOX across any edit.

## Project

**Sushkabot** — Telegram group sobriety check-ins. Evening windows, inline buttons, live LLM regen, dual streaks. Russian UI.

| Doc | Role |
|-----|------|
| [`docs/SPEC.md`](docs/SPEC.md) | Product behavior contract (what) |
| [`docs/AGENTS.md`](docs/AGENTS.md) | Spec-first workflow + SPEC checklist |
| [`CLAUDE.md`](CLAUDE.md) | Stack, commands, architecture cheat sheet |

## Core Contract

- `AGENTS.md` files are binding work contracts for their subtrees
- Work must stay understandable from the nearest `AGENTS.md` plus every parent above it
- **Do not duplicate SPEC in AGENTS** — link SPEC sections; AGENTS owns process and local architecture

## Read Before Editing

1. Read this root `AGENTS.md`
2. Identify every file or folder you expect to touch
3. Walk from repo root to each target path; read every `AGENTS.md` on the route
4. If a parent lists a child `AGENTS.md` whose scope contains the path, read that child
5. Use nearest `AGENTS.md` as local contract; parents for repo-wide rules
6. If docs conflict, closer doc wins for local details; no child may weaken DOX

Re-read the applicable DOX chain in the current session before editing. Do not rely on memory.

## Product Changes (Spec First + DOX)

For behavior, flows, commands, LLM prompts, data model, or env/config semantics:

1. **Read DOX chain** for touched paths
2. **Update SPEC first** — [`docs/SPEC.md`](docs/SPEC.md) per [`docs/AGENTS.md`](docs/AGENTS.md) checklist
3. **Implement** — code, migrations, tests
4. **Closeout** — sync SPEC and code; update nearest `AGENTS.md` if contracts/workflows/structure changed

Skip SPEC only when: pure refactor (zero behavior change), typo/formatting in non-spec files, user says spec later.

## Update After Editing

Every meaningful change requires a DOX closeout before the task is done.

Update the closest owning `AGENTS.md` when a change affects purpose, scope, contracts, workflows, verification, or child index. Update parents when structure or index changes. Remove stale or contradictory text.

Small edits with no contract impact may leave docs unchanged; still re-check the DOX chain.

## Hierarchy

- Root `AGENTS.md` — DOX rail, project pointers, top-level Child DOX Index
- Child `AGENTS.md` — domain-specific rules and nested index
- Closer doc = more specific and practical

## Child Doc Shape

Create a child `AGENTS.md` when a folder is a durable boundary (purpose, rules, workflow, verification).

Default section order: Purpose → Ownership → Local Contracts → Work Guidance → Verification → Child DOX Index

## Style

Concise, operational, stable contracts. Broad rules in parents; concrete details in children. No diary entries.

## Closeout

1. Re-check changed paths against DOX chain
2. Update nearest owning docs and affected parents/children
3. Refresh affected Child DOX Index entries
4. Run relevant verification (`pnpm lint`, `typecheck`, `test`)
5. Report docs intentionally left unchanged and why

## User Preferences

- Spec-first for product behavior (see [`docs/AGENTS.md`](docs/AGENTS.md))
- Caveman communication when workspace rules request it

## Child DOX Index

| Path | Owns |
|------|------|
| [`docs/AGENTS.md`](docs/AGENTS.md) | SPEC, DEPLOY, changelog, IDEAS; spec-first checklist |
| [`src/AGENTS.md`](src/AGENTS.md) | Application source (`index.ts`, `env.ts`, stack, boot) |
| [`tests/AGENTS.md`](tests/AGENTS.md) | Test tiers, helpers, fixtures |
| [`deploy/AGENTS.md`](deploy/AGENTS.md) | VPS bootstrap scripts (ops detail in `docs/DEPLOY.md`) |

Nested under `src/AGENTS.md`: `bot/`, `services/`, `db/`, `prompts/` — each has its own `AGENTS.md`.
