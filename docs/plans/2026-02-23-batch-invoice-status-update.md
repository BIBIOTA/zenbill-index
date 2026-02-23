# 發票批次狀態更新設計

**日期:** 2026-02-23
**狀態:** 已核可

## 需求

使用者希望能一次選取多筆發票，批次將狀態更新為 IGNORED（批次忽略）。目前只有單筆更新 API (`PATCH /invoices/{id}/status`)，操作效率低。

## 設計決策

採用**單一批次端點**方案（YAGNI 原則），不做通用批次操作框架。

## API 規格

```
PATCH /api/v1/invoices/batch/status

Request:
{
  "ids": ["uuid-1", "uuid-2", ...],  // 最多 100 筆
  "status": "IGNORED"                 // 支援所有 InvoiceStatus
}

Response 200:
{
  "updated_count": 5
}

Error 400: ids 為空或超過 100 筆
Error 422: 無效狀態值
```

## 後端架構（Clean Architecture）

### Domain Layer
- `InvoiceRepository` 介面新增 `BatchUpdateStatus(ctx, userID uuid.UUID, ids []uuid.UUID, status InvoiceStatus) (int64, error)`

### Repository Layer
- GORM 實作：`WHERE id IN (?) AND user_id = ?` 確保使用者只能更新自己的發票
- 回傳實際更新筆數

### Delivery Layer
- 新增 `PATCH /invoices/batch/status` endpoint
- 驗證：ids 不為空、不超過 100 筆、status 為有效值
- 回傳 `{ "updated_count": N }`

## 前端設計

### Hook
- `useBatchUpdateInvoiceStatus()` - TanStack Query mutation，成功後 invalidate invoices 快取

### UI 變更（InvoicesPage）
- 每行發票左側加 checkbox
- 表頭「全選」checkbox（只選當前頁）
- 選取後底部浮動 toolbar：`已選取 N 筆 | [批次忽略] [取消選取]`
- 操作完成後自動清空選取、刷新列表

### 互動邏輯
- 使用 `Set<string>` 管理已選取的 invoice IDs
- 「全選」只影響當前頁面的發票
- 切換頁面時保留已選取的 IDs
- 批次操作後清空選取狀態
