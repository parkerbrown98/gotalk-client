#!/bin/sh
# Rebuilds the throwaway stack's data from scratch (its own `gotalk-shots` compose project only), then seeds and backdates it.
set -e
cd "$(dirname "$0")"
docker compose down -v >/dev/null 2>&1
docker compose up -d >/dev/null 2>&1
for i in $(seq 1 40); do curl -sf localhost:18080/api/v1/instance >/dev/null && break; sleep 2; done
node seed.mjs >/dev/null
./psql.sh -f - < backdate.sql >/dev/null
echo reset-done
