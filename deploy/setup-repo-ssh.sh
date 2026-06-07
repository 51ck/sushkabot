#!/usr/bin/env bash
# One-time: RSA deploy key + repo-specific SSH Host for git clone/pull on VPS.
# Run as the deploy user — no sudo required.
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-51ck/sushkabot}"
SSH_HOST="${SSH_HOST:-github-sushkabot}"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/sushkabot_repo_rsa}"
SSH_DIR="$HOME/.ssh"
CONFIG="$SSH_DIR/config"
CONFIG_MARKER="# sushkabot deploy key ($SSH_HOST)"

if [ "$(id -u)" -eq 0 ]; then
  echo "Do not run as root. Run as your deploy user (no sudo)."
  exit 1
fi

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ ! -f "$KEY_PATH" ]; then
  ssh-keygen -t rsa -b 4096 -f "$KEY_PATH" -N "" -C "sushkabot-vps-repo-deploy"
  echo "Created $KEY_PATH"
else
  echo "Key already exists: $KEY_PATH"
fi
chmod 600 "$KEY_PATH"
chmod 644 "${KEY_PATH}.pub"

if [ -f "$CONFIG" ] && grep -qF "$CONFIG_MARKER" "$CONFIG"; then
  echo "SSH config already has Host $SSH_HOST"
else
  touch "$CONFIG"
  chmod 600 "$CONFIG"
  cat >> "$CONFIG" <<EOF

$CONFIG_MARKER
Host $SSH_HOST
  HostName github.com
  User git
  IdentityFile $KEY_PATH
  IdentitiesOnly yes
EOF
  echo "Added SSH config Host $SSH_HOST"
fi

if ! grep -qF 'github.com' "$SSH_DIR/known_hosts" 2>/dev/null; then
  ssh-keyscan -t rsa,ed25519 github.com >> "$SSH_DIR/known_hosts" 2>/dev/null
  chmod 644 "$SSH_DIR/known_hosts"
  echo "Added github.com to known_hosts"
fi

REPO_URL="git@${SSH_HOST}:${GITHUB_REPO}.git"

echo ""
echo "Add this deploy key to the repo (read-only):"
echo "  https://github.com/${GITHUB_REPO}/settings/keys"
echo ""
cat "${KEY_PATH}.pub"
echo ""
echo "Then test and bootstrap:"
echo "  ssh -T git@${SSH_HOST}"
echo "  REPO_URL=${REPO_URL} ./deploy/bootstrap-vps.sh"
