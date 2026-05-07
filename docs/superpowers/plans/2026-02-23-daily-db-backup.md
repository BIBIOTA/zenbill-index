# Daily Database Backup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically back up the ZenBill PostgreSQL database daily to a local directory, with 7-day retention and easy restore.

**Architecture:** A shell script runs `pg_dump` via `docker exec` against the `zenbill_postgres` container, saving custom-format dumps to `~/backups/zenbill/`. macOS launchd triggers it daily at 03:00 with missed-job catch-up. A companion restore script provides one-command recovery.

**Tech Stack:** bash, pg_dump/pg_restore (PostgreSQL 16), Docker CLI, macOS launchd

---

### Task 1: Create the backup script

**Files:**
- Create: `backend/scripts/db-backup.sh`

**Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration
BACKUP_DIR="${ZENBILL_BACKUP_DIR:-$HOME/backups/zenbill}"
CONTAINER_NAME="zenbill_postgres"
DB_NAME="zenbill_db"
DB_USER="zenbill"
RETENTION_DAYS=7

# Timestamp
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/zenbill_db_${TIMESTAMP}.dump"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Check container is running
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q true; then
    echo "[ERROR] Container $CONTAINER_NAME is not running. Skipping backup."
    exit 1
fi

# Run pg_dump
echo "[INFO] Starting backup: $BACKUP_FILE"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom > "$BACKUP_FILE"

# Verify file was created and is non-empty
if [ ! -s "$BACKUP_FILE" ]; then
    echo "[ERROR] Backup file is empty or missing: $BACKUP_FILE"
    rm -f "$BACKUP_FILE"
    exit 1
fi

FILESIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
echo "[INFO] Backup complete: $BACKUP_FILE (${FILESIZE} bytes)"

# Retention: delete backups older than N days
DELETED=$(find "$BACKUP_DIR" -name "zenbill_db_*.dump" -mtime +${RETENTION_DAYS} -print -delete | wc -l | tr -d ' ')
if [ "$DELETED" -gt 0 ]; then
    echo "[INFO] Deleted $DELETED backup(s) older than $RETENTION_DAYS days"
fi

echo "[INFO] Done. Current backups:"
ls -lh "$BACKUP_DIR"/zenbill_db_*.dump 2>/dev/null || echo "(none)"
```

**Step 2: Make it executable**

Run: `chmod +x backend/scripts/db-backup.sh`

**Step 3: Test it manually**

Run: `backend/scripts/db-backup.sh`
Expected: A `.dump` file appears in `~/backups/zenbill/` with non-zero size.

**Step 4: Commit**

```bash
git add backend/scripts/db-backup.sh
git commit -m "feat: add database backup script with 7-day retention"
```

---

### Task 2: Create the restore script

**Files:**
- Create: `backend/scripts/db-restore.sh`

**Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="zenbill_postgres"
DB_NAME="zenbill_db"
DB_USER="zenbill"
BACKUP_DIR="${ZENBILL_BACKUP_DIR:-$HOME/backups/zenbill}"

# Usage
if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/zenbill_db_*.dump 2>/dev/null || echo "  (none found in $BACKUP_DIR)"
    exit 1
fi

BACKUP_FILE="$1"

# Resolve relative paths
if [ ! -f "$BACKUP_FILE" ]; then
    # Try in backup dir
    if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
        BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
    else
        echo "[ERROR] File not found: $BACKUP_FILE"
        exit 1
    fi
fi

# Check container is running
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q true; then
    echo "[ERROR] Container $CONTAINER_NAME is not running."
    exit 1
fi

# Confirm
echo "⚠️  This will DROP and recreate all tables in $DB_NAME."
echo "   Restoring from: $BACKUP_FILE"
read -p "   Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Restore
echo "[INFO] Restoring database from $BACKUP_FILE ..."
docker exec -i "$CONTAINER_NAME" pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < "$BACKUP_FILE"

echo "[INFO] Restore complete."
```

**Step 2: Make it executable**

Run: `chmod +x backend/scripts/db-restore.sh`

**Step 3: Commit**

```bash
git add backend/scripts/db-restore.sh
git commit -m "feat: add database restore script"
```

---

### Task 3: Create launchd plist and install script

**Files:**
- Create: `backend/scripts/com.zenbill.db-backup.plist`
- Create: `backend/scripts/install-backup-schedule.sh`

**Step 1: Create the plist file**

The plist references the backup script via an absolute path that varies per user, so we use an install script to generate it.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.zenbill.db-backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>__BACKUP_SCRIPT_PATH__</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>__LOG_DIR__/db-backup.log</string>
    <key>StandardErrorPath</key>
    <string>__LOG_DIR__/db-backup.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
```

**Step 2: Create the install script**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_TEMPLATE="$SCRIPT_DIR/com.zenbill.db-backup.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.zenbill.db-backup.plist"
BACKUP_SCRIPT="$SCRIPT_DIR/db-backup.sh"
LOG_DIR="$HOME/Library/Logs/zenbill"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Check backup script exists
if [ ! -x "$BACKUP_SCRIPT" ]; then
    echo "[ERROR] Backup script not found or not executable: $BACKUP_SCRIPT"
    exit 1
fi

# Unload existing job if present
if launchctl list | grep -q com.zenbill.db-backup; then
    echo "[INFO] Unloading existing job..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Generate plist with actual paths
sed -e "s|__BACKUP_SCRIPT_PATH__|${BACKUP_SCRIPT}|g" \
    -e "s|__LOG_DIR__|${LOG_DIR}|g" \
    "$PLIST_TEMPLATE" > "$PLIST_DEST"

# Load the job
launchctl load "$PLIST_DEST"

echo "[INFO] Backup schedule installed."
echo "  Plist: $PLIST_DEST"
echo "  Script: $BACKUP_SCRIPT"
echo "  Log: $LOG_DIR/db-backup.log"
echo "  Schedule: Daily at 03:00"
echo ""
echo "To uninstall: launchctl unload $PLIST_DEST && rm $PLIST_DEST"
```

**Step 3: Make install script executable**

Run: `chmod +x backend/scripts/install-backup-schedule.sh`

**Step 4: Commit**

```bash
git add backend/scripts/com.zenbill.db-backup.plist backend/scripts/install-backup-schedule.sh
git commit -m "feat: add launchd plist and install script for daily backup"
```

---

### Task 4: Add Makefile targets

**Files:**
- Modify: `backend/Makefile`

**Step 1: Add backup targets to Makefile**

Add these targets and update the `.PHONY` line and `help` output:

Add to `.PHONY`:
```
db-backup db-restore db-backup-install
```

Add to `help`:
```
@echo "  make db-backup         - 手動執行資料庫備份"
@echo "  make db-restore        - 從備份還原資料庫"
@echo "  make db-backup-install - 安裝每日自動備份排程"
```

Add targets at end:
```makefile
# 資料庫備份
db-backup:
	@scripts/db-backup.sh

# 資料庫還原
db-restore:
	@scripts/db-restore.sh

# 安裝每日備份排程
db-backup-install:
	@scripts/install-backup-schedule.sh
```

**Step 2: Test `make db-backup`**

Run: `cd backend && make db-backup`
Expected: Backup created in `~/backups/zenbill/`.

**Step 3: Commit**

```bash
git add backend/Makefile
git commit -m "feat: add Makefile targets for db-backup, db-restore, db-backup-install"
```

---

### Task 5: Install the schedule and verify

**Step 1: Install the launchd schedule**

Run: `cd backend && make db-backup-install`
Expected: Plist installed to `~/Library/LaunchAgents/`, job loaded.

**Step 2: Verify the job is loaded**

Run: `launchctl list | grep zenbill`
Expected: `com.zenbill.db-backup` appears in the list.

**Step 3: Final commit with updated design doc status**

No code changes needed — just verify everything works end to end.
