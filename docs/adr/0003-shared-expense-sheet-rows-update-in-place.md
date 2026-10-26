# 共同支出編輯後，Sheet 上的那一列原地更新

共同帳本綁定的 Google Sheet「表單」分頁，原本對 ZenBill 而言是**只 append** 的：推送用 `Append`，`google_sheet_row_index` 只是「已同步」的標記而非真實列號；刪除同步以 `created_at 時間戳|說明` 找列刪除；拉資料以 `日期|說明` 判斷是否已存在。共同支出支援編輯後，我們決定讓已推送過的支出在被編輯時，於下次同步**原地更新**那一列：記下 `sheet_update_pending` 與上次推送時的說明（`sheet_synced_description`），以舊的 `時間戳|說明` 找到那一列後用 `UpdateRows` 覆寫。

## Considered Options

**不同步（否決）**：Sheet 維持舊值。但拉資料以 `日期|說明` 判斷新列，只要改了日期或說明，舊的那一列下次就會被拉回來，變成一筆重複支出。

**先刪後加（否決）**：沿用既有的刪除同步與 append。實作最省，但第 0 欄時間戳會變成編輯時間、列的順序跑掉；「表單」同時是 Google 表單的回應表，partner 看到的是一筆「新」紀錄，失去原本的記錄時間。

**原地更新（採用）**：時間戳欄維持原本的 `created_at`，所以只有說明被改時新舊定位 key 才不同，只需多存一個舊說明。

## Consequences

- 「表單」分頁不再是 ZenBill 只 append 的對象，ZenBill 會覆寫既有列的第 1–9 欄（第 0 欄時間戳不變）。仍然**不寫**「分帳」分頁。
- 拉資料與 `repairPhantomSynced` 必須認得 pending 支出的舊定位 key，否則推送失敗時會產生重複或誤判。
- 用舊 key 找不到那一列時（例如 Sheet 上被手動刪掉），清掉 pending、不重新 append：手動刪除代表 Sheet 那邊不要它了。
- 同步仍是單向的：在 Sheet 上直接改既有列，不會拉回 ZenBill。若日後要雙向，需要另外處理衝突，這份決策不涵蓋。
