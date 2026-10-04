#!/usr/bin/env bash
# Nightly SQLite backup to S3. Needs the instance role to allow s3:PutObject, and the AWS CLI on the host.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
docker compose exec -T app node --disable-warning=ExperimentalWarning src/backup.ts /data/calendar.db /data/backup.db
aws s3 cp ./data/backup.db "s3://${S3_BUCKET}/calendar-$(date +%F).db"
rm -f ./data/backup.db
