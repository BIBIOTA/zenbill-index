# 結算交易類型改為 INCOME/EXPENSE 設計

## 日期
2026-02-25

## 問題

目前結算待收付款並指定個人帳戶時，系統建立 **TRANSFER** 交易（應收帳款 ↔ 個人帳戶）。但應收帳款代表與他人的債務關係，不是自己的帳戶間轉帳，使用 TRANSFER 語意不正確。

## 設計

### 核心規則

結算指定個人帳戶時，從原本的 **1 筆 TRANSFER** 改為 **2 筆獨立交易**：

1. **個人帳戶交易** — INCOME（收到還款）或 EXPENSE（付出還款）
2. **應收帳戶沖銷交易** — EXPENSE（沖銷應收）或 INCOME（沖銷應付）

不指定帳戶的結算維持現有邏輯（只調整餘額，不建交易）。

### 場景 A：對方還我 $50，存入銀行（netReceivable > 0）

| # | Type | Account | Amount | Balance 變化 | Note |
|---|------|---------|--------|-------------|------|
| 1 | INCOME | 銀行帳戶 | 50 | +50 | 收到還款: {description} |
| 2 | EXPENSE | Owner 應收帳款 | 50 | -50 | 沖銷應收: {description} |
| - | (mirror) | Partner 應收帳款 | - | +50 | 餘額同步 |

### 場景 B：我還 $50 給對方，從銀行付出（netReceivable < 0）

| # | Type | Account | Amount | Balance 變化 | Note |
|---|------|---------|--------|-------------|------|
| 1 | EXPENSE | 銀行帳戶 | 50 | -50 | 還款給對方: {description} |
| 2 | INCOME | Owner 應收帳款 | 50 | +50 | 沖銷應付: {description} |
| - | (mirror) | Partner 應收帳款 | - | -50 | 餘額同步 |

### 場景 C：不指定帳戶

維持現有邏輯 — 只調整應收帳款餘額，不建任何交易。

### 欄位變更

SharedExpense entity 新增欄位：

```
settlement_transaction_id           → 應收帳戶沖銷交易 ID（現有欄位，語意調整）
settlement_personal_transaction_id  → 個人帳戶 INCOME/EXPENSE 交易 ID（新增）
```

## 影響範圍

### Backend
- `internal/domain/shared_expense.go` — 新增 `SettlementPersonalTransactionID` 欄位
- `internal/usecase/shared_expense_service.go` — 修改 `Settle()` 和 `SettleAll()`
- Migration SQL — 新增 `settlement_personal_transaction_id` 欄位

### Frontend
- 無需修改（結算 API request/response 不變，交易類型是後端邏輯）

### Dashboard 統計
- 需確認 RECEIVABLE 帳戶的 INCOME/EXPENSE 交易不會被計入個人收支統計
- 目前已有 `WHERE accounts.type != 'RECEIVABLE'` 過濾，應該安全

## 不做的事
- 不修改不指定帳戶的結算邏輯
- 不修改前端 UI
- 不遷移既有的 TRANSFER 結算交易
