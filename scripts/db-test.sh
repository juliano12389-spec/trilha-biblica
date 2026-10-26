#!/usr/bin/env bash
# Runs the database test suite against a disposable local PostgreSQL.
#
# It drops and recreates the database named by DB_TEST_NAME (default: stockpro_test),
# applies the local auth stub, applies every migration in order, then runs the SQL tests.
#
# Usage:
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres scripts/db-test.sh
#
# Refuses non-local hosts on purpose: this script drops a database.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
DB_TEST_NAME="${DB_TEST_NAME:-stockpro_test}"

case "$PGHOST" in
  127.0.0.1|localhost|/*) ;;
  *)
    echo "Recusado: PGHOST=$PGHOST não é local. Este script recria o banco $DB_TEST_NAME." >&2
    exit 1
    ;;
esac

if [[ ! "$DB_TEST_NAME" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "Nome de banco inválido: $DB_TEST_NAME" >&2
  exit 1
fi

export PGHOST PGPORT PGUSER
ADMIN_DB="postgres"

echo "==> Recriando banco descartável $DB_TEST_NAME em $PGHOST:$PGPORT"
psql -X -q -v ON_ERROR_STOP=1 -d "$ADMIN_DB" -c "drop database if exists $DB_TEST_NAME with (force);"
psql -X -q -v ON_ERROR_STOP=1 -d "$ADMIN_DB" -c "create database $DB_TEST_NAME;"

run() {
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB_TEST_NAME" -f "$1"
}

echo "==> Stub de auth local (somente testes)"
run "$ROOT/supabase/tests/local/auth_stub.sql"

echo "==> Migrações"
shopt -s nullglob
migrations=("$ROOT"/supabase/migrations/*.sql)
if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "Nenhuma migração encontrada" >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  echo "    $(basename "$migration")"
  run "$migration"
done

echo "==> Testes SQL"
run "$ROOT/supabase/tests/fase1_fundacao.test.sql"

echo "==> Concluído"
