#!/usr/bin/env bash
# Run on the server: prompts for the Supabase session pooler URL (hidden) and stores it in ~/app/.env.
# Keeps the password out of your shell history and out of chat. A password with special characters must be URL-encoded.
set -euo pipefail
cd "$(dirname "$0")/.."
read -rsp "Paste the Supabase session pooler URL (input is hidden): " url; echo
case "$url" in postgres://*|postgresql://*) ;; *) echo "That does not look like a postgres:// URL. Nothing saved."; exit 1;; esac
{ grep -v '^DATABASE_URL=' .env || true; printf 'DATABASE_URL=%s\n' "$url"; } > .env.new
chmod 600 .env.new && mv .env.new .env
echo "Saved DATABASE_URL to $(pwd)/.env"
