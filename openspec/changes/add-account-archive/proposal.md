## Why

不再使用的帳戶（停卡的信用卡、結清的銀行帳戶、出清的股票）目前只能留在帳戶列表與下拉選單中，
或嘗試硬刪除。硬刪除只檢查 `account_id`，帳戶一有交易就無法刪；而且它沒有檢查
`target_account_id`、`auto_pay_from_id`、`merchants.default_account_id`、
`tpass_cards.linked_account_id`，刪除後可能留下懸空引用。App 端則完全沒有移除帳戶的入口。

## What Changes

- **account-archive**: 新增可逆的「封存」，並收緊既有的「永久刪除」
  - `accounts` 新增 nullable `archived_at timestamptz`（NULL = 使用中）
  - 新增 `POST /accounts/:id/archive`、`POST /accounts/:id/unarchive`
  - 封存條件：依幣別精度四捨五入後餘額為 0；股票另需 `shares_held == 0`；
    非任何信用卡的自動扣款來源；非任何商家預設帳戶；未綁定 TPASS 卡；
    本身若為信用卡，自動扣款必須關閉。不自動解除任何引用。
  - 不符時回 HTTP 409，`data.reasons` 列出所有原因（code + 中文 message）
  - 取消封存：無任何條件
  - 永久刪除：帳戶必須已封存，且無 `account_id` / `target_account_id` 交易、無上述引用，否則 409
  - 已封存帳戶不可作為**新增**交易的來源或目標帳戶（400）；既有交易可照常編輯、刪除
  - 已封存信用卡不再產生繳款提醒
  - `GET /accounts` 仍回傳全部帳戶並帶 `archived_at`，由前端分區
  - App / Web：列表預設隱藏已封存（底部可展開區塊）；新增交易的帳戶選單排除已封存；
    封存 / 取消封存 / 永久刪除入口與確認對話框

## Impact

- Affected specs: `specs/account-archive/`
- Affected code:
  - `backend/migrations/` — 新增 `archived_at` migration
  - `backend/internal/domain/account.go`、`repository.go`
  - `backend/internal/usecase/` — 新增帳戶封存服務；交易寫入路徑加封存檢查
  - `backend/internal/repository/account_repository.go`（`FindCreditCardsDueOn` / `FindCreditCardsDueToday` 排除已封存）
  - `backend/internal/delivery/http/account_handler.go`
  - `packages/shared/src/`（`Account.archived_at`、`useArchiveAccount`、`useUnarchiveAccount`、`getAccountBlockReasons`、`ApiError.data`）
  - `frontend/src/pages/AccountsPage.tsx` 與交易表單
  - `app/app/(tabs)/accounts.tsx`、`app/app/accounts/[id].tsx` 與交易表單
- Breaking changes: `DELETE /accounts/:id` 對未封存帳戶改為回 409（原本無交易即可刪）。
