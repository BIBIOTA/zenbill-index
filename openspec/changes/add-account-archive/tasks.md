## 0. 共用契約（已完成）

- [x] 0.1 `packages/shared`：`Account.archived_at`、`AccountBlockReason(Code)`、`ApiError.data`、
      `useArchiveAccount` / `useUnarchiveAccount` / `getAccountBlockReasons` / `isAccountArchived`
- [x] 0.2 409 回應格式：`{ code: 409, message, data: { reasons: [{ code, message }] } }`

## 1. Backend

- [x] 1.1 migration：`accounts.archived_at timestamptz NULL`；`domain.Account.ArchivedAt`、`IsArchived()`
- [x] 1.2 Domain：封存條件判斷（餘額依幣別精度、股數、自動扣款）為純函式並有單元測試
- [x] 1.3 Usecase：`AccountArchiveService.Archive / Unarchive / Delete`，彙整全部引用原因
- [x] 1.4 Repository：引用查詢（auto_pay_from_id、merchants.default_account_id、tpass_cards.linked_account_id、
      account_id / target_account_id 交易數）
- [x] 1.5 交易新增路徑（一般交易、股票買賣配息、auto-pay、共同帳本轉個人交易、發票匯入）拒絕已封存帳戶
      （集中在 `TransactionRepository.Create` 檢查，回 `domain.ErrAccountArchived` → HTTP 400；
      後端目前尚無配息寫入路徑，日後實作只要走 `TransactionRepo.Create` 即受保護）
- [x] 1.6 `FindCreditCardsDueOn` / `FindCreditCardsDueToday` 排除已封存
- [x] 1.7 Handler + routes：archive / unarchive / 改寫 delete，409 帶 reasons
- [x] 1.8 測試全綠、`golangci-lint run` 無新錯誤

## 2. Web（frontend/）

- [x] 2.1 帳戶列表分區：已封存收在底部可展開區塊
- [x] 2.2 刪除按鈕改為「封存」；已封存帳戶顯示「取消封存」「永久刪除」
- [x] 2.3 確認對話框與 409 原因清單對話框
- [x] 2.4 新增交易帳戶選單排除已封存（編輯時保留目前帳戶）

## 3. App（app/）

- [x] 3.1 帳戶 tab 分區：已封存收在底部可展開區塊
- [x] 3.2 帳戶詳情頁右上選單：封存 / 取消封存 / 永久刪除；已封存橫幅
- [x] 3.3 確認對話框與 409 原因清單
- [x] 3.4 新增交易帳戶選單排除已封存（編輯時保留目前帳戶）
