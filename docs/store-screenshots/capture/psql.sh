#!/bin/sh
cd "$(dirname "$0")" && docker compose exec -T postgres psql -U gotalk -d gotalk -At "$@"
