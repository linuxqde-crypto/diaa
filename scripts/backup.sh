#!/usr/bin/env sh
# KROTO nightly DB backup — run from cron: 0 3 * * * /app/scripts/backup.sh
set -eu
TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-kroto}" -Fc "${POSTGRES_DB:-kroto}" \
  > "$OUT_DIR/kroto-$TS.dump"
# keep last 14 daily dumps
ls -1t "$OUT_DIR"/kroto-*.dump | tail -n +15 | xargs -r rm -f
echo "backup ok: $OUT_DIR/kroto-$TS.dump"
