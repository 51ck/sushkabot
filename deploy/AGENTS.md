# Deploy scripts

## Purpose

VPS bootstrap and SSH setup scripts. Ops contract: [`../docs/DEPLOY.md`](../docs/DEPLOY.md).

## Ownership

- `bootstrap-vps.sh` — initial VPS setup
- `setup-repo-ssh.sh` — deploy key / repo access
- `.env.production.example` — production env template (semantics in SPEC §9)

## Local Contracts

- Server runs pre-built GHCR image only (`docker compose pull`); no build on VPS
- SQLite lives on host volume (`data/`); see DEPLOY.md for layout

## Work Guidance

- Pipeline or VPS layout change → `docs/DEPLOY.md` first, then scripts here
- Secrets never committed; use parent `.env` on VPS

## Verification

- CI: `.github/workflows/ci.yml` (PR), `deploy.yml` (push `master`)

## Child DOX Index

(none)
