# Sushkabot

Telegram bot for group sobriety check-ins: evening reminders with inline buttons, deadline windows, live progress on the check-in message, and daily summaries with streaks.

## Stack

- TypeScript 7 (`tsgo`) + Bun + pnpm 11
- grammY, Drizzle ORM, SQLite, croner, Biome

## Quick start (development)

1. Create a **test bot** via [@BotFather](https://t.me/BotFather).
2. Copy env file:

```bash
cp .env.development.example .env.development
cp .env.development .env   # or export ENV vars another way
```

3. Set `BOT_TOKEN` and `ADMIN_USER_IDS` (your Telegram numeric user id).
4. Install and run:

```bash
corepack enable
pnpm install
pnpm dev
```

5. Add the bot to a **private test group** (admin: post + edit messages).
6. In the group: `/setup` → then `/force_open` to test without waiting for cron.

## Commands

| Command | Where | Description |
|---------|-------|-------------|
| `/setup` | Group | Admin setup wizard |
| `/config` | Group | Edit settings |
| `/join` | Group | Opt in to tracking |
| `/leave` | Group | Opt out |
| `/status` | Group | Window + streak |
| `/settings` | DM | Timezone help |
| `/settimezone` | DM | Set personal timezone |
| `/help` | Anywhere | Help |
| `/force_open` | Group | Dev only — open window now |
| `/force_close` | Group | Dev only — close + summary |

## Tests

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:handlers
```

## Production (VPS + GHCR)

Images are built in GitHub Actions and pushed to **GHCR**. The VPS only pulls and runs — no build on server.

### VPS layout

```
~/sushkabot/          # or VPS_INSTALL_DIR — owned by deploy user, no sudo
├── .env          # secrets + GHCR_IMAGE + IMAGE_TAG
├── data/         # SQLite (persisted)
├── backups/
└── app/          # git clone (docker-compose.yml)
```

### One-time server setup

Run as the **deploy user** (not root). One-time root task only: add user to `docker` group (`usermod -aG docker deploy`).

**Two SSH keys** (different jobs):

| Key | Where | Purpose |
|-----|--------|---------|
| Repo deploy key (RSA) | VPS `~/.ssh/sushkabot_repo_rsa` | `git clone` / `git pull` on VPS |
| Actions deploy key | GitHub secret `VPS_SSH_KEY` | GitHub Actions SSH into VPS |

From your laptop, copy bootstrap scripts to the VPS:

```bash
scp -P YOUR_SSH_PORT -r deploy VPS_USER@VPS_HOST:~/sushkabot-bootstrap/
```

On the VPS:

```bash
cd ~/sushkabot-bootstrap
chmod +x setup-repo-ssh.sh bootstrap-vps.sh
./setup-repo-ssh.sh
# Paste the printed public key → GitHub repo → Settings → Deploy keys (read-only)

ssh -T git@github-sushkabot
REPO_URL=git@github-sushkabot:YOU/sushkabot.git ./bootstrap-vps.sh
```

Edit `~/sushkabot/.env` (or your `INSTALL_DIR`):

- `BOT_TOKEN`, `ADMIN_USER_IDS`
- `GHCR_IMAGE=ghcr.io/your-github-user/sushkabot` (lowercase)
- `DATABASE_PATH=/app/data/sushkabot.db`

### GitHub secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `VPS_HOST` | yes | Server IP or hostname |
| `VPS_PORT` | if not 22 | SSH port (Actions → VPS only) |
| `VPS_USER` | yes | SSH user (non-root deploy user) |
| `VPS_SSH_KEY` | yes | Private SSH key |
| `VPS_INSTALL_DIR` | no | Default `~/sushkabot` — set if bootstrap used another path |
| `GHCR_READ_TOKEN` | if private package | Classic PAT with `read:packages` for `docker pull` |

Add the **Actions** public key to `~/.ssh/authorized_keys` on the VPS (not the repo deploy key).

### Deploy flow

On every push to `master`:

1. **test** — lint, typecheck, `bun test`
2. **build-push** — Docker image → `ghcr.io/<owner>/sushkabot:latest` and `:sha-<commit>`
3. **deploy** — SSH: `git pull`, update `IMAGE_TAG` in `.env`, `docker compose pull && up -d`

PRs run CI only (`.github/workflows/ci.yml`).

### Manual operations on VPS

```bash
cd ~/sushkabot/app
docker compose --env-file ~/sushkabot/.env pull
docker compose --env-file ~/sushkabot/.env up -d
docker compose --env-file ~/sushkabot/.env logs -f bot
```

### Rollback

Set an older tag in `~/sushkabot/.env`:

```bash
IMAGE_TAG=sha-abc1234   # previous deploy tag from GHCR
```

Then `docker compose --env-file ~/sushkabot/.env pull && up -d`.

### Backups

```bash
cp ~/sushkabot/data/sushkabot.db ~/sushkabot/backups/sushkabot-$(date +%F).db
```

Restore: stop container, replace `.db` file, start container.

## BotFather

1. `/newbot` — create bot, copy token
2. `/setprivacy` → **Disable** (optional, for future features)
3. Add bot to group with permission to post and edit messages

Command menu (`/join`, `/setup`, etc.) is registered automatically via `setMyCommands` on bot start — no manual `/setcommands` in BotFather needed.

## Environment variables

| Variable | Description |
|----------|-------------|
| `BOT_ENV` | `development` or `production` |
| `BOT_TOKEN` | Telegram bot token |
| `ADMIN_USER_IDS` | Comma-separated Telegram user IDs |
| `DATABASE_PATH` | SQLite file path (production: `/app/data/sushkabot.db`) |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` |
| `GHCR_IMAGE` | Production only — e.g. `ghcr.io/user/sushkabot` |
| `IMAGE_TAG` | Production only — `latest` or `sha-<commit>` (set by deploy) |
