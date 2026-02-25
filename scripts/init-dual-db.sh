#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ZenBill: One-time data migration from zenbill_db → dual DBs
# ============================================================
# Prerequisites:
#   1. PostgreSQL container running: docker compose -f docker-compose.yml up -d db
#   2. Existing data in zenbill_db
#
# This script:
#   1. Dumps zenbill_db (schema + data)
#   2. Creates zenbill_dev and zenbill_prod if they don't exist
#   3. Restores the dump into both databases
# ============================================================

CONTAINER="zenbill_postgres"
DB_USER="zenbill"
SOURCE_DB="zenbill_db"
TARGET_DBS=("zenbill_dev" "zenbill_prod")
DUMP_FILE="/tmp/zenbill_dump.sql"

echo "=== ZenBill Dual Database Migration ==="
echo ""

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: Container '${CONTAINER}' is not running."
    echo "Start it with: cd backend && docker compose -f docker-compose.yml up -d db"
    exit 1
fi

# Dump source database
echo "[1/4] Dumping ${SOURCE_DB}..."
docker exec "${CONTAINER}" pg_dump -U "${DB_USER}" -d "${SOURCE_DB}" --clean --if-exists > "${DUMP_FILE}"
echo "  Dump saved to ${DUMP_FILE} ($(wc -c < "${DUMP_FILE}" | tr -d ' ') bytes)"

for TARGET_DB in "${TARGET_DBS[@]}"; do
    echo ""
    echo "[2/4] Creating database ${TARGET_DB} (if not exists)..."
    docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -tc \
        "SELECT 1 FROM pg_database WHERE datname = '${TARGET_DB}'" | grep -q 1 || \
        docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -c \
        "CREATE DATABASE ${TARGET_DB} OWNER ${DB_USER};"
    echo "  Database ${TARGET_DB} ready."

    echo "[3/4] Restoring dump into ${TARGET_DB}..."
    docker exec -i "${CONTAINER}" psql -U "${DB_USER}" -d "${TARGET_DB}" < "${DUMP_FILE}"
    echo "  Restored into ${TARGET_DB}."
done

echo ""
echo "[4/4] Verifying..."
for TARGET_DB in "${TARGET_DBS[@]}"; do
    TABLE_COUNT=$(docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${TARGET_DB}" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
    echo "  ${TARGET_DB}: ${TABLE_COUNT} tables"
done

# Cleanup
rm -f "${DUMP_FILE}"

echo ""
echo "=== Migration complete ==="
echo "Dev services → zenbill_dev"
echo "Prod services → zenbill_prod"
