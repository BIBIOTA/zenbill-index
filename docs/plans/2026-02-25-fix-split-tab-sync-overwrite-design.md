# Fix: 分帳 Tab Sync Overwrite Bug

**Date:** 2026-02-25
**Problem:** ZenBill 同步共同記帳到 Google Sheet 時，會把「分帳」tab 原本存在的 header (row 1-3) 和帳務資料覆蓋掉。

## Root Cause

`SyncToSheet` 寫入「分帳」tab 時使用 `UpdateRows`（Google Sheets `Values.Update`），在 row 定位不準確或邊界條件處理不完善時，可能覆蓋既有內容。此外缺乏寫入前後的驗證機制，無法偵測或防止資料損壞。

## Solution: 精確 Append + Header 保護 + 驗證

### 修改 1: `client.go` — 新增 `ReadRows` 方法

```go
func (c *Client) ReadRows(ctx context.Context, spreadsheetID, sheetRange string) ([][]interface{}, error)
```

用於讀取指定 range 的資料，支援寫入前後驗證 header 完整性。

### 修改 2: `sheet_sync_service.go` — Header 驗證 + 安全寫入

1. **寫入前驗證 header**: 讀取 `'分帳'!A3:I3`，確認 header row 存在
2. **精確 row 定位**: 使用既有 `GetLastDataRow` + 詳細 logging
3. **寫入後驗證 header**: 重新讀取 row 1-3 確認未被破壞
4. **失敗時回報錯誤** 而非靜默忽略

### Files to Modify

| File | Change |
|------|--------|
| `backend/pkg/googlesheet/client.go` | Add `ReadRows` method |
| `backend/internal/usecase/sheet_sync_service.go` | Add header validation, detailed logging, post-write verification |
