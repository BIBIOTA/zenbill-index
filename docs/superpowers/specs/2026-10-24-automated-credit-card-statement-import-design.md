# 信用卡帳單全自動匯入設計

## 目標

每天 09:30（`Asia/Taipei`）由 OpenClaw 檢查 Gmail 中本月新收到的信用卡電子帳單，使用受保護的銀行 PDF 密碼解密，將可明確判讀且通過安全檢查的帳單摘要匯入 ZenBill，完成後在 ZenBill 通知中心建立通知並向 APP 發送 Expo push。只有異常或需要人工判斷時才打擾使用者。

本功能只處理信用卡帳單摘要（應繳總額、最低應繳、截止日等），不做逐筆交易對帳，也不新增或修改消費交易。

## 已確認決策

- 採用 OpenClaw agent 排程編排，重用 ZenBill repo 既有 `credit-card-statement-import` skill 與 `statement.py`。
- 每天 09:30 執行，時區固定為 `Asia/Taipei`。
- 採全自動模式；銀行 PDF 密碼只存於 OpenClaw Secret Store。
- 同帳戶、同帳期若已有 `source=manual` 的帳單，不覆蓋，改為通知使用者處理。
- 整合帳單必須整批通過驗證並原子寫入；任何一張卡失敗時整批不寫入。
- 匯入成功後建立 ZenBill APP 通知並 best-effort 發送 Expo push。

## 架構

### 1. OpenClaw 排程

建立一個 enabled automation：

- cron：`30 9 * * *`
- timezone：`Asia/Taipei`
- 工作目錄：ZenBill repo
- payload：agent turn，明確要求載入 `credit-card-statement-import` skill 的 unattended workflow
- 正常無新帳單時靜默；只有成功匯入或異常才通知

排程負責 Gmail 搜尋、附件下載、選擇 Secret、解析欄位、呼叫匯入工具，以及更新處理狀態；ZenBill 工具負責 DB 安全檢查、原子寫入與 APP 通知。

### 2. 銀行設定與 Secrets

skill 內新增不含敏感值的銀行設定，為每家支援銀行定義：

- 穩定的銀行識別碼
- Gmail 查詢條件（寄件者網域與信用卡帳單主旨關鍵字）
- Secret Store 名稱，例如 `ZENBILL_STATEMENT_PASSWORD_CATHAY`
- 對應 ZenBill 帳戶名稱關鍵字；最終仍以 PDF 中的卡號末碼、卡名及幣別確認

密碼值不得寫入 repo、狀態檔、prompt、命令輸出或 log。解密時由 Gateway host 將 Secret 以環境變數注入單次命令，命令只能引用變數名稱，不得展開或印出值。下載的加密 PDF 放在每次執行的暫存目錄，結束時移至垃圾桶或安全清除；不保存解密後 PDF。

若某家銀行所需 Secret 尚未設定，該附件不匯入，記為可重試錯誤並通知使用者補設定；不得猜測密碼。

### 3. Gmail 掃描與處理狀態

每次只搜尋本月收到、含 PDF 附件的信用卡帳單信件。搜尋結果仍需讀取寄件者、主旨、內文與 PDF 開頭，排除存款或綜合帳戶對帳單中的非信用卡區塊。

以 `gmail_message_id + attachment_id` 作為附件唯一鍵，狀態寫入 OpenClaw workspace 的 `state/zenbill-credit-card-statement-import.json`。狀態至少記錄：

- 銀行識別碼、message id、attachment id
- 首次與最後處理時間
- `imported`、`manual_conflict`、`retryable_error` 或 `permanent_error`
- 寫入的 statement id／account id／cycle end（成功時）
- `notification_status`（`pending`、`sent` 或 `failed`）
- ZenBill notification id（通知資料已建立時）
- 不含 PDF 內容或個資的錯誤代碼

`imported` 不重跑 DB 寫入；若其 `notification_status=failed`，下次排程只重試尚未完成的通知步驟。若 notification id 已存在，只重送 push，不重複建立通知中心資料。`manual_conflict` 與 `permanent_error` 不在每日排程重試，除非附件唯一鍵改變或使用者明確重設。`retryable_error`（例如 Secret 缺少、暫時無法連線）在下一次排程重試，但同一錯誤一天最多通知一次。

## 資料流程與安全檢查

1. 搜尋本月候選信件並列出 PDF 附件。
2. 排除狀態為 `imported`、`manual_conflict` 或 `permanent_error` 的附件。
3. 依寄件者與主旨選銀行設定，讀信件內密碼規則作為稽核依據，再用對應 Secret 解密。
4. 確認 PDF 為信用卡帳單，並抽出 `amount_due`、`minimum_due`、`due_date`、`statement_date`、`previous_balance`、`payments_credited`、`new_charges`；找不到的選填欄位存 `null`，不得推算。
5. 依卡號末碼、卡名與幣別對應唯一 ZenBill CREDIT account。對應為零個或多個時停止，不寫入。
6. 以既有 cycle 規則將銀行結帳日對應到 `cycle_end`。`gap_days > 7`、缺少結帳日或帳期不明時停止，不寫入。
7. 多幣別各自對到同幣別帳戶，不換匯。
8. 整合帳單先按 ZenBill 既有規則分卡，驗證各卡 `amount_due` 加總等於銀行總額；差額不為零或歸屬有歧義時整份停止。
9. 匯入工具在單一 DB transaction 內重新驗證所有帳戶、cycle end、必填欄位與既有 statement：
   - 任一既有 statement 的 `source=manual`，整批 rollback 並回傳 `manual_conflict`。
   - 其他既有 statement 可依現行 whole-row replace 語意更新為 `source=skill`。
   - 整合帳單所有列一次 commit；不得部分成功。
10. DB commit 成功後立即把附件狀態標成 `imported`，保存 statement references，避免後續步驟失敗造成重複寫入。
11. 逐卡重新執行 estimate，產出帳單金額、ZenBill 預估與 diff；查核失敗需回報，但不再次匯入。
12. 寫入一筆 ZenBill notification，並以既有 Expo push 路徑 best-effort 推播；依結果更新 `notification_status`。

## ZenBill 匯入工具調整

擴充 `.claude/skills/credit-card-statement-import/scripts/statement.py`，提供機器可判讀、可測試的批次介面：

- 接收一份不含密碼與 PDF 文字的 JSON payload。
- 在 transaction 內對全部列做 validation、manual-source guard 與 upsert。
- 成功輸出固定 JSON schema，含每列 statement 與 estimate。
- 失敗輸出穩定的錯誤代碼，且 DB 無任何變更。
- 保留既有互動式單筆命令，避免破壞目前人工工作流。
- `--rollback` 能完整演練批次寫入與保護規則。

skill 文件新增「排程／unattended workflow」章節，互動式 workflow 仍維持逐筆確認；只有排程模式可在所有自動安全條件成立時略過人工確認。

## APP 通知

新增通知類型 `CREDIT_CARD_STATEMENT_IMPORTED`。一次排程執行對同一使用者合併成一筆通知：

- 標題：`信用卡帳單已更新`
- 內文：列出銀行／卡片、帳期及應繳金額；多張卡時以精簡摘要呈現
- `resource_type=notifications`，點擊 push 進入通知中心

DB notification 建立失敗視為匯入後異常：帳單資料不回滾，附件維持 `imported` 並將 `notification_status` 記為 `failed`，下次只重試通知。Expo push 是 best-effort；push 失敗不回滾 DB notification 或帳單，錯誤交由排程回報。

異常通知使用相同通知中心／push 能力；若 ZenBill 通知路徑本身不可用，OpenClaw automation 的 failure delivery 作為最後備援。

## 錯誤分類

### 可重試

- Gmail、Docker、DB 或 Expo 的暫時性連線問題
- 尚未設定對應 Secret
- PDF 解密失敗（可能是使用者更新 Secret 後即可恢復）

### 需人工處理，不自動重試

- `source=manual` 衝突
- 無法唯一對應 ZenBill 帳戶
- `amount_due`、結帳日或帳期不明
- cycle 日期差超過 7 天
- 整合帳單小計不符或差額歸屬有歧義
- PDF 格式改版導致欄位來源無法證明

所有錯誤訊息可包含銀行、信件主旨、附件識別碼與安全的錯誤原因，不得包含 PDF 密碼、完整身分證字號、完整卡號或帳單全文。

## 測試策略

### 純函式與 CLI 測試

- 附件唯一鍵與狀態轉移。
- 本月 Gmail 日期範圍（含跨年）。
- 單卡、多幣別與整合帳單 payload validation。
- `source=manual` 時整批拒絕。
- 第二次處理同附件不重複寫入或通知。
- 通知摘要在單卡與多卡時的格式。
- log／JSON 輸出不含 Secret 或 PDF 全文。

### DB rollback 整合測試

以歷史帳單的去識別化 fixture 驗證：

- 新增單一卡片帳單。
- 更新既有 `source=skill` 帳單。
- 遇到既有 `source=manual` 時零寫入。
- 整合帳單其中一列失敗時零寫入。
- 所有列成功時 statement、source 與 estimate 正確。

### 排程驗證

- 先以 `--rollback` 手動 force-run automation。
- 驗證 Gmail 候選、Secret 注入、解析、狀態檔與通知內容。
- 使用測試通知確認 ZenBill 通知中心與實機 push。
- 驗證「無新帳單」不產生通知。
- 通過後才啟用每日 09:30 正式排程。

## 驗收條件

- 新帳單在下一次 09:30 執行後自動出現在正式 ZenBill DB。
- 同一附件連續執行兩次只產生一份帳單結果與一筆成功通知。
- 手動帳單永不被自動覆蓋。
- 整合帳單不會出現部分寫入。
- 所有密碼只存在 OpenClaw Secret Store，repo、狀態檔與 logs 均無明文。
- 成功匯入可在 ZenBill APP 通知中心看到，且有 push token 時會嘗試發送 Expo push。
- 任何歧義或驗證失敗都不寫入帳單，並提供不含敏感資料的可處理原因。

## 不在本次範圍

- 信用卡逐筆交易對帳或自動補交易。
- 自動猜測 PDF 密碼、卡片對應或整合帳單差額歸屬。
- 修改信用卡 closing day 或 ZenBill 帳務計算規則。
- 把 Gmail OAuth 或排程搬入 ZenBill backend worker。
