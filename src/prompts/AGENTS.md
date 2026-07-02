# Prompts

## Purpose

LLM prompt text and task builders. Product contract: [`../../docs/SPEC.md`](../../docs/SPEC.md) §6.

## Ownership

- `system.md` — system prompt (loaded at runtime)
- `load-system.ts` — MD loader + kind-specific task suffix
- `live-window.ts`, `messages.ts`, `weekly.ts` — task body builders per kind

## Local Contracts

**Task kinds:** `open`, `live`, `summary`, `stats` (SPEC §6.1).

**Shared context** built in `services/llm-context.ts` + trimmed by `services/context-budget.ts` — do not duplicate schedule/roster rules here.

**Provider:** OpenAI-compatible; temperature 0.9; timeout 8s. Copy/tone rules belong in `system.md`; structural rules in SPEC §6.

## Work Guidance

- Prompt or generation-behavior change → SPEC §6 first, then `system.md` / TS builders
- `tests/unit/llm-prompts.test.ts` for prompt shape regressions

## Verification

```bash
bun test tests/unit/llm-prompts.test.ts tests/unit/llm.test.ts
```

## Child DOX Index

(none)
