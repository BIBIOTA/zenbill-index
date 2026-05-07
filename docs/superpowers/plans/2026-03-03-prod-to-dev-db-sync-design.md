# Prod-to-Dev Database Sync Design

**Date:** 2026-03-03
**Status:** Approved

## Goal

每日自動將 `zenbill_prod` 資料庫完整複製到 `zenbill_dev`，讓開發測試時能直接使用 prod 環境的真實資料。

## Context

- Prod 和 Dev 在同一台 macOS 機器上，共用同一個 PostgreSQL Docker 容器 (`zenbill_postgres`)
- 已有 `scripts/db-backup.sh` 每日備份 prod（launchd 排程）
- 兩個資料庫：`zenbill_prod`、`zenbill_dev`，由 `docker/init-databases.sql` 初始化建立
- 不需要資料脱敏（個人使用）

## Approach

**pg_dump + pg_restore pipe**：在 PostgreSQL 容器內直接用 pipe 串接 dump 和 restore，不產生中間檔案。

## Components

### 1. `scripts/db-sync-prod-to-dev.sh`

Shell script，核心邏輯：

```bash
docker exec zenbill_postgres pg_dump -U zenbill -Fc zenbill_prod | \
docker exec -i zenbill_postgres pg_restore -U zenbill -d zenbill_dev --clean --if-exists --no-owner
```

功能：
- 檢查 `zenbill_postgres` 容器是否運行
- 使用 pipe 直接串接 pg_dump → pg_restore（不落地暫存檔）
- `--clean --if-exists`：先刪除 dev 中的現有物件再建立
- `--no-owner`：不設定 owner（兩邊用同一個 user）
- 記錄同步結果到 `$HOME/logs/zenbill/db-sync.log`
- 輸出同步耗時

### 2. `scripts/install-sync-schedule.sh`

安裝 launchd plist 到 `~/Library/LaunchAgents/`。

**plist 名稱：** `com.zenbill.db-sync.plist`
**執行時間：** 每日凌晨 04:00

### 3. Makefile targets

```makefile
db-sync:              # 手動執行 prod → dev 同步
db-sync-install:      # 安裝每日自動同步排程
```

## Schedule Order

| Time  | Task | Script |
|-------|------|--------|
| 03:00 | Backup prod | `db-backup.sh` (existing) |
| 04:00 | Sync prod → dev | `db-sync-prod-to-dev.sh` (new) |

## Error Handling

- 容器未運行 → 輸出錯誤並 exit 1
- pg_dump/pg_restore 失敗 → 記錄錯誤到 log
- 不會影響 prod 資料（只讀 prod，只寫 dev）

## Files to Create

1. `backend/scripts/db-sync-prod-to-dev.sh` - 同步腳本
2. `backend/scripts/install-sync-schedule.sh` - 排程安裝腳本
3. Update `backend/Makefile` - 新增 `db-sync` 和 `db-sync-install` targets
