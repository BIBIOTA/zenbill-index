# Daily Database Backup Design

**Date:** 2026-02-23
**Status:** Approved

## Summary

每天自動備份 ZenBill PostgreSQL 資料庫快照到本機目錄，保留最近 7 天，使用 macOS launchd 排程。

## Architecture

```
launchd (每天 03:00)
  → backend/scripts/db-backup.sh
    → docker exec zenbill_postgres pg_dump --format=custom
    → 存到 ~/backups/zenbill/zenbill_db_YYYY-MM-DD_HHMMSS.dump
    → 刪除 7 天前的備份
```

## Files

| File | Purpose |
|------|---------|
| `backend/scripts/db-backup.sh` | Backup script (pg_dump + retention cleanup) |
| `backend/scripts/db-restore.sh` | Restore script (pg_restore from .dump) |
| `com.zenbill.db-backup.plist` | launchd schedule (installed to `~/Library/LaunchAgents/`) |

## Backup Script Logic

1. Check Docker container `zenbill_postgres` is running
2. `docker exec` runs `pg_dump -U zenbill -d zenbill_db --format=custom`
3. Filename format: `zenbill_db_2026-02-23_030000.dump`
4. Delete `.dump` files older than 7 days
5. Log output to stdout (captured by launchd)

## Restore Script

`db-restore.sh <backup_file>` — uses `pg_restore` to restore from a specified `.dump` file.

## Backup Format

PostgreSQL custom format (`--format=custom`):
- Built-in compression (no extra gzip needed)
- Supports selective restore (individual tables)
- Faster restore than plain SQL

## Storage

- Location: `~/backups/zenbill/`
- Retention: 7 days
- Estimated size: ~1-5 MB per backup (small dev database)

## Scheduling

- macOS launchd via `~/Library/LaunchAgents/com.zenbill.db-backup.plist`
- Runs daily at 03:00
- Missed jobs are executed on next wake (launchd built-in behavior)
