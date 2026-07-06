#!/bin/sh
# entrypoint.sh — copy build-time DB to persistent volume if needed

BUILD_DB="/app/server/perumda_ledger.db"
PROD_DB="${DB_PATH:-/app/data/perumda_ledger.db}"
PROD_DIR=$(dirname "$PROD_DB")

# Ensure data directory exists
mkdir -p "$PROD_DIR"

# Check if persistent volume DB needs refresh
NEEDS_REFRESH=0

if [ ! -f "$PROD_DB" ]; then
  echo "📦 No production DB found. Copying build-time DB..."
  NEEDS_REFRESH=1
elif [ -f "$BUILD_DB" ]; then
  # Check if build-time DB has the new journal_lines schema with tanggal column
  HAS_TANGGAL=$(sqlite3 "$PROD_DB" "PRAGMA table_info(journal_lines);" 2>/dev/null | grep -c "tanggal" || true)
  if [ "$HAS_TANGGAL" = "0" ]; then
    echo "📦 Production DB has old schema (missing tanggal column). Refreshing..."
    NEEDS_REFRESH=1
  else
    # Check if production has multi-line transactions (3+ lines)
    MULTI=$(sqlite3 "$PROD_DB" "SELECT COUNT(*) FROM (SELECT journal_id FROM journal_lines GROUP BY journal_id HAVING COUNT(*) >= 3 LIMIT 1);" 2>/dev/null || echo "0")
    if [ "$MULTI" = "0" ]; then
      echo "📦 Production DB has stale data (no multi-line transactions). Refreshing..."
      NEEDS_REFRESH=1
    else
      echo "✅ Production DB OK (has multi-line transactions)"
    fi
  fi
fi

if [ "$NEEDS_REFRESH" = "1" ] && [ -f "$BUILD_DB" ]; then
  # Preserve user-created data (non-XL entries) if prod DB exists
  if [ -f "$PROD_DB" ]; then
    echo "   Backing up existing DB..."
    cp "$PROD_DB" "${PROD_DB}.bak"
  fi
  cp "$BUILD_DB" "$PROD_DB"
  echo "✅ Build-time DB copied to production volume"
fi

# Repair any corrupted/empty journal_lines.akun_code on the live volume DB so
# Buku Besar shows every account/sub-account (Kendala #1). Idempotent — only
# touches rows whose akun_code is null/empty or not present in COA. Runs every
# boot; never blocks startup.
echo "🔧 Memeriksa & memperbaiki journal_lines.akun_code..."
DB_PATH="$PROD_DB" node fix_journal_lines_akun_code.cjs || echo "⚠️  repair dilewati (server tetap dijalankan)"

# Start server
exec node server/index.cjs
