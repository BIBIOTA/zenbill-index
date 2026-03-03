# 共同記帳支出計入個人記帳 — 設計文件

**日期:** 2026-03-03
**狀態:** Draft

## 目標

擴充共同記帳新增支出功能，讓使用者在付款時可以選擇計入個人記帳，並支援商家自動帶入分類和帳戶。Web 和 App 都需要支援。

## 需求摘要

1. 共同記帳新增支出時，若付款人是自己，顯示「計入個人記帳」開關
2. 開關打開後，顯示商家/分類/帳戶選擇器
3. 選擇商家後自動帶入該商家的預設分類和預設帳戶（跟個人記帳一樣的行為）
4. 分類和帳戶可手動覆蓋
5. 付款人是對方時，隱藏此開關（不能計入個人帳戶）
6. 計入個人記帳的金額為**全額**（因為你實際付了全額）

## UX 流程

```
付款人: [我] / [對方]
         ↓ (僅「我」時顯示)
[  ] 計入個人記帳          ← Switch/Toggle
         ↓ (僅開啟時顯示)
  商家:    [選擇商家 ▾]     ← 選擇後自動帶入下方欄位
  分類:    [自動帶入 ▾]     ← 可手動覆蓋
  帳戶:    [自動帶入 ▾]     ← 可手動覆蓋
```

**行為規則：**
- 付款人切換為「對方」→ 開關自動關閉 + 區塊隱藏
- 開關關閉 → 商家/分類/帳戶欄位隱藏並清空值
- 選商家 → 若分類為空且商家有 `default_category_id`，自動帶入
- 選商家 → 若帳戶為空且商家有 `default_account_id`，自動帶入
- 已手動選擇過分類/帳戶 → 選商家不覆蓋

## 技術設計

### Backend 變更

#### 1. API Request 新增欄位

`createSharedExpenseRequest` (shared_expense_handler.go):

```go
type createSharedExpenseRequest struct {
    // ... existing fields ...
    PaymentAccountID   *string `json:"payment_account_id"`
    MerchantID         *string `json:"merchant_id"`          // NEW
    PersonalCategoryID *string `json:"personal_category_id"` // NEW
}
```

#### 2. Usecase Input 新增欄位

`CreateSharedExpenseInput` (shared_expense_service.go):

```go
type CreateSharedExpenseInput struct {
    // ... existing fields ...
    PaymentAccountID *uuid.UUID
    MerchantID         *uuid.UUID // NEW
    PersonalCategoryID *uuid.UUID // NEW
}
```

#### 3. 個人交易建立邏輯擴充

在 `SharedExpenseService.Create` 建立個人交易時，加上 MerchantID 和 CategoryID：

```go
if input.PaymentAccountID != nil {
    expenseTx := &domain.Transaction{
        ID:         uuid.New(),
        UserID:     userID,
        AccountID:  *input.PaymentAccountID,
        Type:       domain.TransactionTypeExpense,
        Amount:     input.TotalAmount,
        OccurredAt: input.Date,
        Note:       fmt.Sprintf("共同記帳: %s", input.Description),
        CategoryID: input.PersonalCategoryID, // NEW
        MerchantID: input.MerchantID,         // NEW
    }
    // ... rest unchanged ...
}
```

#### 4. Handler 解析邏輯

在 handler 的 Create 方法中解析新欄位並傳入 input。

### Frontend (Web) 變更

**檔案:** `frontend/src/pages/SharedExpenseFormPage.tsx`

1. 新增 state：
   - `recordPersonal: boolean` (開關狀態)
   - `merchantId: string | undefined`
   - `personalCategoryId: string | undefined`

2. 付款人為自己時，顯示 Toggle + 商家/分類/帳戶區塊

3. 複用現有組件：
   - `MerchantSelect` (或類似的商家選擇組件)
   - `CategorySelect`
   - `AccountSelect`

4. 複用 `handleMerchantChange` 邏輯：選商家後自動帶入分類和帳戶

5. 提交時，若 `recordPersonal` 為 true，送出 `payment_account_id`、`merchant_id`、`personal_category_id`

6. 移除現有的獨立 PaymentAccount 下拉（改為在開關區塊內）

### App (Mobile) 變更

**檔案:** `app/app/shared-ledgers/[id]/expenses/new.tsx`

1. 同樣的開關 + 商家/分類/帳戶區塊

2. 複用 App 版的選擇器組件（SearchableSelect 等）

3. 實作商家自動帶入邏輯（目前 App 的個人記帳也缺少此功能，一併補上）

### 不需要的變更

- **資料庫 Schema**: 不需要變更。`Transaction` 已有 `category_id` 和 `merchant_id` 欄位
- **Domain Entity**: 不需要變更
- **新增 API endpoint**: 不需要。現有的商家/分類/帳戶 API 已可使用

## 影響範圍

| 層級 | 檔案 | 變更類型 |
|------|------|----------|
| Backend Handler | `shared_expense_handler.go` | 新增欄位解析 |
| Backend Usecase | `shared_expense_service.go` | 新增欄位傳遞 |
| Web Frontend | `SharedExpenseFormPage.tsx` | UI 擴充 |
| App Frontend | `expenses/new.tsx` | UI 擴充 |
| Shared Types | `packages/shared/src/types/` | 新增 request 欄位 |

## 測試計畫

1. **Backend**: 驗證建立共同支出時，個人交易正確帶上 merchant_id 和 category_id
2. **Web**: 驗證商家選擇後自動帶入、開關行為、付款人切換行為
3. **App**: 同上
