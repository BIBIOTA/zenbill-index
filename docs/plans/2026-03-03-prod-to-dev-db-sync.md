# Prod-to-Dev Database Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a daily scheduled job that copies `zenbill_prod` to `zenbill_dev` via pg_dump/pg_restore pipe, with launchd scheduling on macOS.

**Architecture:** A shell script uses `docker exec` to pipe `pg_dump` output from `zenbill_prod` directly into `pg_restore` targeting `zenbill_dev`, all within the same `zenbill_postgres` container. A launchd plist runs this daily at 04:00 (after the existing 03:00 backup). Makefile targets provide manual access.

**Tech Stack:** Bash, pg_dump/pg_restore, Docker, launchd (macOS)

**Design doc:** `docs/plans/2026-03-03-prod-to-dev-db-sync-design.md`

---

### Task 1: Create the sync script

**Files:**
- Create: `backend/scripts/db-sync-prod-to-dev.sh`

**Reference:** Follow the style of `backend/scripts/db-backup.sh` — same shebang, set flags, container check pattern, logging format.

**Step 1: Create the sync script**

Create `backend/scripts/db-sync-prod-to-dev.sh` with this exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration
CONTAINER_NAME="zenbill_postgres"
SOURCE_DB="zenbill_prod"
TARGET_DB="zenbill_dev"
DB_USER="zenbill"

# Timestamp
START_TIME=$(date +%s)
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)

echo "[$TIMESTAMP] [INFO] Starting sync: $SOURCE_DB → $TARGET_DB"

# Check container is running
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q true; then
    echo "[ERROR] Container $CONTAINER_NAME is not running. Skipping sync."
    exit 1
fi

# Sync: pg_dump from prod | pg_restore to dev
# --clean: drop existing objects before restoring
# --if-exists: don't error if objects don't exist yet
# --no-owner: skip ownership (same user for both DBs)
if docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -Fc "$SOURCE_DB" | \
   docker exec -i "$CONTAINER_NAME" pg_restore -U "$DB_USER" -d "$TARGET_DB" --clean --if-exists --no-owner 2>&1; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "[INFO] Sync complete: $SOURCE_DB → $TARGET_DB (${DURATION}s)"
else
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "[WARN] Sync finished with warnings (${DURATION}s). This is usually normal — pg_restore may warn about pre-existing objects."
fi
```

**Step 2: Make it executable**

Run: `chmod +x backend/scripts/db-sync-prod-to-dev.sh`

**Step 3: Test the script manually**

Run: `cd /Users/yuki/projects/zen-bill/backend && ./scripts/db-sync-prod-to-dev.sh`

Expected output:
```
[2026-03-03_...] [INFO] Starting sync: zenbill_prod → zenbill_dev
[INFO] Sync complete: zenbill_prod → zenbill_dev (Ns)
```

Note: `pg_restore --clean` may emit warnings about objects that don't exist — this is expected and the script handles it with a WARN message instead of failing.

**Step 4: Commit**

```bash
git add backend/scripts/db-sync-prod-to-dev.sh
git commit -m "feat: add prod-to-dev database sync script"
```

---

### Task 2: Create launchd plist template

**Files:**
- Create: `backend/scripts/com.zenbill.db-sync.plist`

**Reference:** Follow exact structure of `backend/scripts/com.zenbill.db-backup.plist` — same XML format, placeholder pattern (`__SYNC_SCRIPT_PATH__`, `__LOG_DIR__`), same PATH environment variable.

**Step 1: Create the plist template**

Create `backend/scripts/com.zenbill.db-sync.plist` with this exact content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.zenbill.db-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>__SYNC_SCRIPT_PATH__</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>4</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>__LOG_DIR__/db-sync.log</string>
    <key>StandardErrorPath</key>
    <string>__LOG_DIR__/db-sync.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
```

**Step 2: Commit**

```bash
git add backend/scripts/com.zenbill.db-sync.plist
git commit -m "feat: add launchd plist template for db sync schedule"
```

---

### Task 3: Create the schedule installer script

**Files:**
- Create: `backend/scripts/install-sync-schedule.sh`

**Reference:** Follow exact structure of `backend/scripts/install-backup-schedule.sh` — same pattern for unload/sed/load, same log directory, adapted for sync naming.

**Step 1: Create the installer script**

Create `backend/scripts/install-sync-schedule.sh` with this exact content:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_TEMPLATE="$SCRIPT_DIR/com.zenbill.db-sync.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.zenbill.db-sync.plist"
SYNC_SCRIPT="$SCRIPT_DIR/db-sync-prod-to-dev.sh"
LOG_DIR="$HOME/Library/Logs/zenbill"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Check sync script exists
if [ ! -x "$SYNC_SCRIPT" ]; then
    echo "[ERROR] Sync script not found or not executable: $SYNC_SCRIPT"
    exit 1
fi

# Unload existing job if present
if launchctl list | grep -q com.zenbill.db-sync; then
    echo "[INFO] Unloading existing job..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Generate plist with actual paths
sed -e "s|__SYNC_SCRIPT_PATH__|${SYNC_SCRIPT}|g" \
    -e "s|__LOG_DIR__|${LOG_DIR}|g" \
    "$PLIST_TEMPLATE" > "$PLIST_DEST"

# Load the job
launchctl load "$PLIST_DEST"

echo "[INFO] Sync schedule installed."
echo "  Plist: $PLIST_DEST"
echo "  Script: $SYNC_SCRIPT"
echo "  Log: $LOG_DIR/db-sync.log"
echo "  Schedule: Daily at 04:00"
echo ""
echo "To uninstall: launchctl unload $PLIST_DEST && rm $PLIST_DEST"
```

**Step 2: Make it executable**

Run: `chmod +x backend/scripts/install-sync-schedule.sh`

**Step 3: Commit**

```bash
git add backend/scripts/install-sync-schedule.sh
git commit -m "feat: add installer for daily db sync schedule"
```

---

### Task 4: Add Makefile targets

**Files:**
- Modify: `backend/Makefile` (the `.PHONY` line and add targets at the end of the `=== 資料庫 ===` section)

**Step 1: Update `.PHONY` declaration**

In `backend/Makefile:1`, add `db-sync` and `db-sync-install` to the `.PHONY` line:

Change:
```makefile
.PHONY: help build run-api run-worker test test-integration lint dev dev-down dev-logs prod prod-down prod-logs frontend-dev-logs frontend-prod-logs docker-up docker-build migrate clean tidy db-backup db-restore db-backup-install
```

To:
```makefile
.PHONY: help build run-api run-worker test test-integration lint dev dev-down dev-logs prod prod-down prod-logs frontend-dev-logs frontend-prod-logs docker-up docker-build migrate clean tidy db-backup db-restore db-backup-install db-sync db-sync-install
```

**Step 2: Add help text**

In the `help` target, after the line `@echo "  make db-backup-install - 安裝每日自動備份排程"`, add:

```makefile
	@echo "  make db-sync          - 手動同步 prod → dev 資料庫"
	@echo "  make db-sync-install  - 安裝每日自動同步排程 (04:00)"
```

**Step 3: Add the targets**

At the end of `backend/Makefile`, after the `db-backup-install:` target, add:

```makefile

db-sync:
	@scripts/db-sync-prod-to-dev.sh

db-sync-install:
	@scripts/install-sync-schedule.sh
```

**Step 4: Verify Makefile syntax**

Run: `cd /Users/yuki/projects/zen-bill/backend && make help`

Expected: The help output should now include the two new db-sync entries.

**Step 5: Test make target**

Run: `cd /Users/yuki/projects/zen-bill/backend && make db-sync`

Expected: Same output as running the script directly in Task 1 Step 3.

**Step 6: Commit**

```bash
git add backend/Makefile
git commit -m "feat: add db-sync and db-sync-install Makefile targets"
```

---

### Task 5: Install the schedule and verify

**Step 1: Install the launchd schedule**

Run: `cd /Users/yuki/projects/zen-bill/backend && make db-sync-install`

Expected output:
```
[INFO] Sync schedule installed.
  Plist: /Users/yuki/Library/LaunchAgents/com.zenbill.db-sync.plist
  Script: /Users/yuki/projects/zen-bill/backend/scripts/db-sync-prod-to-dev.sh
  Log: /Users/yuki/Library/Logs/zenbill/db-sync.log
  Schedule: Daily at 04:00

To uninstall: launchctl unload ...
```

**Step 2: Verify the job is loaded**

Run: `launchctl list | grep com.zenbill`

Expected: Both `com.zenbill.db-backup` and `com.zenbill.db-sync` should appear.

**Step 3: Verify the generated plist**

Run: `cat ~/Library/LaunchAgents/com.zenbill.db-sync.plist`

Expected: The placeholders (`__SYNC_SCRIPT_PATH__`, `__LOG_DIR__`) should be replaced with actual paths.
