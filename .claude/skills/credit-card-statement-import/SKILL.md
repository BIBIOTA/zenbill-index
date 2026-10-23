---
name: credit-card-statement-import
description: Use when saving a bank credit-card statement's totals (本期應繳總額、最低應繳、繳款截止日) into ZenBill as a 帳單 — triggers on "匯入帳單", "存帳單", "信用卡應繳", "回補帳單", "statement import", e.g. "匯入 10 月的信用卡帳單". Line-by-line 對帳 of transactions is credit-card-statement-reconcile.
---

# Credit Card Statement Import

把銀行信用卡電子帳單的摘要欄位存成 ZenBill 的**帳單**（`credit_card_statements` 一列，以 `(account_id, cycle_end)` 唯一）。有帳單後，總覽、帳戶頁、自動扣款的應繳總額都以帳單為準。詞彙見 `CONTEXT.md`「信用卡帳單」，決策見 `docs/adr/0002-*.md`。

帳單表不牽動 `accounts.balance`：直寫 DB 不需要補餘額差額，也不碰 `transactions`。

所有 DB 操作走 `scripts/statement.py`（`--help` 看參數）。下文的 `$S` = `.claude/skills/credit-card-statement-import/scripts/statement.py`。預設 DB 是 `zenbill_prod`。

## Workflow

```
1. 確認範圍：月份 + 一張卡，或「這個月所有有電子帳單的卡」
2. 取得帳單文字（找信 → 密碼規則 → 問密碼 → 解密）
3. 抽欄位，多幣別分開
4. statement_date → ZenBill cycle_end
5. 列表給使用者確認
6. upsert 到 zenbill_prod
7. 印出 amount_due 與 ZenBill 預估的差額
8. 收尾：下一封帳單回到 Step 2；最後刪 PDF、總結
```

從 reconcile 的 Step 9 進來時，帳單文字已在手上，直接從 Step 3 開始。

### Step 1 — 範圍

問清楚帳單月份，以及是哪張卡或「所有卡」。列出候選帳戶：

```bash
python3 $S accounts            # 所有未封存的 CREDIT 帳戶：id, name, currency, closing_day, payment_due_day
python3 $S accounts --name 永豐  # 關鍵字過濾
```

「所有卡」時，依銀行分組：一封信可能涵蓋同一銀行的好幾張卡或好幾個幣別。完成條件：一份「銀行 → 帳單月份 → 對應的 ZenBill 帳戶」清單，使用者看過。之後**一封帳單一輪** Step 2–7，每張卡各自確認。

### Step 2 — 取得帳單文字

照 `.claude/skills/credit-card-statement-reconcile/fetch-statement.md` 的 A–D 做。重點：先確認是**信用卡帳單**而不是銀行帳單；密碼規則從信件讀出來、**向使用者要密碼，絕不猜**；密碼只出現在當次 `pdftotext` 指令裡，不寫進任何檔案或 log。

### Step 3 — 抽欄位

從 `pdftotext -layout` 文字的帳單摘要區抽出：

| 欄位 | 帳單上常見的字樣 | |
|---|---|---|
| `amount_due` | 本期應繳總額、本期應繳金額 | **必填**。找不到就停下來問使用者 |
| `minimum_due` | 最低應繳金額 | |
| `due_date` | 繳款截止日 | |
| `statement_date` | 結帳日、帳單結帳日 | Step 4 要用 |
| `previous_balance` | 上期應繳總額、上期帳單金額 | |
| `payments_credited` | 已繳金額、本期繳款、已入帳款項 | 存正數（帳單常印成負號） |
| `new_charges` | 本期新增款項、本期消費 | |

- 每個值都要能指出它在文字裡的那一行；找不到的欄位就是 `null`，不要推算。完成條件：每個欄位不是有出處的值，就是明確的 `null`。
- 金額照帳單印的數字存（同 `transactions.amount`：台幣、日圓都是整數）。`amount_due` 為負代表溢繳，照存負數。
- 民國年日期（如 `115/10/18`）加 1911 轉西元。
- **多幣別帳單**（如幣倍卡、熊本熊卡）：每個幣別各有一組應繳，分別抽，對到同一張卡**幣別相符**的 ZenBill 帳戶（`accounts` 的 `currency`）。不換匯。
- **整合帳單**（同一家銀行把多張卡放在一份帳單，只印一個應繳總額）：每張卡各存一列，該卡的 `amount_due` = 帳單上**該卡的本期新增小計**，`note` = `整合帳單，總額 $X`。其他欄位只在帳單有逐卡印出時才填（例如 `new_charges` = 同一個小計）；整份帳單共用的欄位（`due_date`、`statement_date`）每列都填。寫入前驗證小計加總：

  ```bash
  python3 $S combined --total <應繳總額> --part '<帳戶名>=<小計>' --part '<帳戶名>=<小計>' ...
  ```

  `matches: false`（exit 1）代表銀行層級有結轉或溢繳：停下來，把總額、各卡小計和差額給使用者看，由使用者決定差額加在哪張卡，加完再跑一次直到 `matches: true`。印出的 `note` 原樣帶進 Step 6 的 `--note`。

### Step 4 — 對應 `cycle_end`

```bash
python3 $S cycle --closing-day <closing_day> --statement-date <statement_date>
```

回傳 `cycle_start`、`cycle_end`（該帳戶 `closing_day` 的週期中，`statement_date` 當天或之前最近的那個結束日）與 `gap_days`。規則和 `backend/internal/domain/billing_cycle.go` 一致，包括 closing_day 31 遇短月滾到下個月。

- `needs_confirmation: true`（相差超過 7 天）→ 停下來，把兩個日期給使用者看，問要對哪一期。
- 帳單沒印結帳日 → 問使用者這是哪一期。
- `cycle_end` 本來就會比銀行印的結帳日早幾天：`closing_day` 刻意設得比銀行早，用來配合消費日切期。照 `cycle_end` 存，**不要**為了對上銀行日期去改 `closing_day`。

### Step 5 — 確認（寫入前一定要做）

先查每張卡這一期的現況：

```bash
python3 $S estimate --account-id <id> --cycle-end <cycle_end>
```

列成一張表給使用者，一張卡一列（整合帳單的各列放在一起，表格上方寫「整合帳單，總額 $X = 各卡小計加總」，並標出使用者決定的差額落在哪張卡）：帳戶、幣別、`cycle_end`（附銀行結帳日）、`amount_due`、`minimum_due`、`due_date`、`previous_balance`、`payments_credited`、`new_charges`、ZenBill 預估（`estimated_amount_due`）、既有帳單（`statement`，沒有就寫「無」）。

寫入是**整列取代**：既有帳單存在時，要明講整列會被這次的值蓋掉，沒抽到的欄位會變成空值。`source = manual` 的是使用者手填的，特別標出來，並列出它和這次不同的欄位。完成條件：使用者對每一列都明確同意，或指出要改的值。

### Step 6 — 寫入 `zenbill_prod`

```bash
python3 $S upsert --account-id <id> --cycle-end <cycle_end> --amount-due <X> \
  [--minimum-due X] [--due-date D] [--statement-date D] \
  [--previous-balance X] [--payments-credited X] [--new-charges X] [--note TEXT]
```

- 執行 `INSERT … ON CONFLICT (account_id, cycle_end) DO UPDATE`，`source = 'skill'`，`user_id` 從 `accounts` 帶入。整列取代，和後端 `PUT /accounts/:id/statements/:cycle_end` 一致：沒帶的選填欄位寫成 null；`id`、`created_at` 保留。
- 寫 `zenbill_prod` 前，script 會先檢查 `zenbill_api_prod` 的 `ZENBILL_DB_NAME`，不是 `zenbill_prod` 就中止。正式 APP 只讀 `zenbill_prod`，寫到 `zenbill_dev` 使用者在 APP 完全看不到，兩庫 UUID 又可能相同，很容易誤判成功（同 reconcile skill 的 Prerequisites）。
- script 中止的情況：表不存在（後端 migration 還沒套用）、帳戶不是 CREDIT 或沒有 `closing_day`、`cycle_end` 不是該卡合法的週期結束日。照錯誤訊息回報使用者，不要繞過。
- 想先試跑：加 `--rollback`（在 `BEGIN … ROLLBACK` 裡執行）或 `--print-sql`（只印 SQL）。

完成條件：script 印出寫入的那一列，`source` 是 `skill`。

### Step 7 — 差額

```bash
python3 $S estimate --account-id <id> --cycle-end <cycle_end>
```

對每張卡印出 `amount_due`、`estimated_amount_due`、`diff`（= 帳單 − 預估），以及預估的組成：`cycle_net`（本期消費）+ `carryover`（結轉 = 前一期帳單應繳 − 前一期繳款期間轉入的 TRANSFER；前一期沒有帳單時為 0，不遞迴）。

- `diff = 0` → 這期和銀行一致。
- `diff ≠ 0` → 可能有漏記、記錯，或消費日／入帳日落在不同期。建議接著跑 `credit-card-statement-reconcile` 逐筆對帳。已經是從 reconcile 進來的，就把差額交給使用者判斷。

### Step 8 — 收尾

還有下一封帳單就回到 Step 2。全部做完後：刪掉 scratchpad 裡下載的 PDF，列一張總表（帳戶、`cycle_end`、`amount_due`、`diff`），標出建議對帳的卡。
