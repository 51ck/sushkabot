#!/usr/bin/env bash
# One-time VPS bootstrap for sushkobot (Docker Compose + GHCR pull deploy).
# Run as the deploy user — no sudo required.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/sushkobot}"
REPO_URL="${REPO_URL:-}"

if [ "$(id -u)" -eq 0 ]; then
  echo "Do not run as root. Run as your deploy user (no sudo)."
  exit 1
fi

if [ -z "$REPO_URL" ]; then
  echo "Usage: REPO_URL=https://github.com/you/sushkobot.git ./deploy/bootstrap-vps.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker Engine + Compose plugin first:"
  echo "  https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin not found."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Cannot access Docker as $(whoami)."
  echo "One-time (as root on VPS): usermod -aG docker $(whoami)"
  echo "Then log out and SSH back in."
  exit 1
fi

mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/backups"

APP_DIR="$INSTALL_DIR/app"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "Repo already cloned at $APP_DIR — syncing origin remote"
fi

if git -C "$APP_DIR" remote | grep -qx origin; then
  git -C "$APP_DIR" remote set-url origin "$REPO_URL"
else
  git -C "$APP_DIR" remote add origin "$REPO_URL"
fi
echo "Git remote origin: $(git -C "$APP_DIR" remote get-url origin)"

ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$INSTALL_DIR/app/deploy/.env.production.example" "$ENV_FILE"
  echo "Created $ENV_FILE — edit BOT_TOKEN, ADMIN_USER_IDS, GHCR_IMAGE before first deploy."
else
  echo "$ENV_FILE already exists — leaving unchanged."
fi

chmod 600 "$ENV_FILE"

echo ""
echo "Bootstrap done."
echo "Install dir: $INSTALL_DIR"
echo ""
echo "Next steps:"
echo "  1. Edit $ENV_FILE (BOT_TOKEN, ADMIN_USER_IDS, GHCR_IMAGE)"
echo "  2. Set GitHub secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY"
echo "  3. Optional: VPS_INSTALL_DIR=$INSTALL_DIR if not using ~/sushkobot"
echo "  4. If GHCR package is private, add GHCR_READ_TOKEN (classic PAT, read:packages)"
echo "  5. Push to master — GitHub Actions builds image and deploys"
echo ""
echo "Manual first pull (optional, after image exists in GHCR):"
echo "  cd $INSTALL_DIR/app"
echo "  docker compose --env-file $ENV_FILE pull"
echo "  docker compose --env-file $ENV_FILE up -d"
echo ""
echo "Optional daily backup cron:"
echo "  0 3 * * * cp $INSTALL_DIR/data/sushkobot.db $INSTALL_DIR/backups/sushkobot-\$(date +\\%F).db"
