#!/usr/bin/env bash
# One-time VPS bootstrap for sushkobot (Docker Compose + GHCR pull deploy).
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/sushkobot}"
REPO_URL="${REPO_URL:-}"

if [ -z "$REPO_URL" ]; then
  echo "Usage: REPO_URL=https://github.com/you/sushkobot.git sudo -E ./deploy/bootstrap-vps.sh"
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

mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/backups"

if [ ! -d "$INSTALL_DIR/app/.git" ]; then
  git clone "$REPO_URL" "$INSTALL_DIR/app"
else
  echo "Repo already cloned at $INSTALL_DIR/app"
fi

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
echo ""
echo "Next steps:"
echo "  1. Edit $ENV_FILE (BOT_TOKEN, ADMIN_USER_IDS, GHCR_IMAGE)"
echo "  2. Set GitHub secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY"
echo "  3. If GHCR package is private, add GHCR_READ_TOKEN (PAT with read:packages)"
echo "  4. Push to master — GitHub Actions builds image and deploys"
echo ""
echo "Manual first pull (optional, after image exists in GHCR):"
echo "  cd $INSTALL_DIR/app"
echo "  docker compose --env-file $ENV_FILE pull"
echo "  docker compose --env-file $ENV_FILE up -d"
echo ""
echo "Optional daily backup cron:"
echo "  0 3 * * * cp $INSTALL_DIR/data/sushkobot.db $INSTALL_DIR/backups/sushkobot-\$(date +\\%F).db"
