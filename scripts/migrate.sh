#!/usr/bin/env bash
# Run a migration SQL file directly against the live Supabase project.
# Usage: ./scripts/migrate.sh supabase/migrations/YYYYMMDD_name.sql
#
# Reads SUPABASE_ACCESS_TOKEN from .env if not already set.

set -euo pipefail

PROJECT_REF="ukegudqobnmiesudtjen"
SQL_FILE="${1:-}"

if [[ -z "$SQL_FILE" ]]; then
  echo "Usage: $0 <path/to/migration.sql>"
  exit 1
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "File not found: $SQL_FILE"
  exit 1
fi

# Load .env if token not already in environment
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  if [[ -f ".env" ]]; then
    export $(grep -E '^SUPABASE_ACCESS_TOKEN=' .env | xargs)
  fi
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN not set. Add it to .env or export it."
  exit 1
fi

SQL=$(cat "$SQL_FILE")

echo "Applying: $SQL_FILE"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -n --arg q "$SQL" '{query: $q}')")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  echo "Done. ($HTTP_CODE)"
else
  echo "Failed ($HTTP_CODE): $BODY"
  exit 1
fi
