---
name: credit-card-statement-reconcile
description: Use when reconciling a bank credit card statement against ZenBill records — triggers on "對帳", "信用卡帳單", "核對帳單", "credit card statement", "statement reconcile", "比對帳單", "帳單對帳", or requests to find missing/incorrect credit card transactions, or to record card cashback/回饋 into ZenBill.
---

# Credit Card Statement Reconciliation

對帳指定銀行、指定月份的信用卡電子帳單與 ZenBill 中該卡的交易紀錄，找出 ZenBill **缺漏**或**金額不符**的帳務，並協助記錄信用卡**回饋**。

## When to Use

- 「幫我對一下這個月永豐幣倍卡的帳單」
- 「核對 X 銀行 N 月信用卡帳單跟 ZenBill 有沒有對上」
- 使用者想知道哪些刷卡 ZenBill 漏記或記錯
- 帳單有現金/點數回饋，要記進 ZenBill

## Overview

核心是「以銀行帳單為真實來源 (source of truth)，找出 ZenBill 的差異」。流程：
信件找帳單 PDF → 由信件內容判定密碼規則 → 問使用者密碼 → 解密並抽取帳單明細 → 查 ZenBill 該卡同期交易 → 比對差異 → 回饋另外處理。

## Prerequisites

- `gws` CLI（Gmail 查詢）— 詳見 `yuki-toolkit:gws-reference`
- `pdftotext`（poppler，已安裝）；PDF 解密/抽取也可用 `pdf` skill
- ZenBill DB 容器 `zenbill_postgres` 運行中（`docker ps`）
- 對帳走 **DB 直查**（API 受 JWT 保護，直查 DB 最省事）：
  `docker exec zenbill_postgres psql -U zenbill -d zenbill_prod`
  > ⚠️ **務必用 `zenbill_prod`（正式 APP 連的庫），不是 `zenbill_dev`。**
  > 正式 APP 容器 `zenbill_api_prod` 設定 `ZENBILL_DB_NAME=zenbill_prod`；
  > 寫到 `zenbill_dev` 使用者在 APP 完全看不到。兩庫帳戶/商家/分類 UUID 可能相同（dev 為複本），更容易誤判成功。
  > 不確定時先驗證：`docker inspect zenbill_api_prod --format '{{range .Config.Env}}{{println .}}{{end}}' | grep DB_NAME`
- **直寫 transactions 必須同步 `accounts.balance`**（App 寫入路徑才會自動更新，直寫 DB 不會）。
  慣例 `balance = ΣINCOME − ΣEXPENSE − ΣTRANSFER`；於同一 transaction 內補差額即可，詳見專案 `CLAUDE.md` 已知坑點。

## Workflow

```
1. 確認銀行 + 卡別 + 對帳月份（向使用者問清楚）
2. gws 搜信箱 → 找到該銀行該月帳單信件（確認是「信用卡帳單」而非「銀行帳單」）
3. 讀信件內文 → 判定 PDF 密碼規則（信件通常會寫明）
4. 向使用者詢問密碼（或構成密碼所需資料），切勿自行猜測
5. 下載 + 解密 PDF → pdftotext 抽出帳單明細（日期/金額/商家）
6. 查 ZenBill：該卡 account_id + 帳單週期日期範圍的交易
7. 比對：列出「ZenBill 缺漏」「金額/日期不符」的項目
8. 若帳單有回饋 → 詢問使用者要如何記入 ZenBill，再記錄
```

### Step 1 — 鎖定卡片

ZenBill 一張卡 = 一個 `accounts.type='CREDIT'` 帳戶，關聯 `banks`。先查出 `account_id`：

```bash
docker exec zenbill_postgres psql -U zenbill -d zenbill_prod -c \
"SELECT a.id, a.name, b.name AS bank, a.payment_due_day
 FROM accounts a LEFT JOIN banks b ON a.bank_id=b.id
 WHERE a.type='CREDIT' AND a.name ILIKE '%關鍵字%';"
```

`payment_due_day` 是繳款日，可協助推算帳單週期。

### Step 2 — 找帳單信件（gws）

```bash
gws gmail users messages list --params '{"userId":"me","q":"<銀行> 信用卡 電子帳單 after:YYYY/MM/DD before:YYYY/MM/DD has:attachment","maxResults":5}'
```

調整 `q`：用寄件者網域（如 `from:sinopac.com`）+ 主旨關鍵字更精準。找到後取信件內文：

```bash
gws gmail users messages get --params '{"userId":"me","id":"<msgId>","format":"full"}'
```

附件下載：用 `gws gmail users messages attachments get`，或從信件取得 `attachmentId` 後存檔成 PDF。

> ⚠️ **帳單分兩種：銀行帳單 vs 信用卡帳單，別拿錯。**
> 銀行寄的「電子對帳單／電子帳單」可能是 **存款帳戶對帳單（銀行帳單）**，也可能是 **信用卡帳單**，兩者主旨和寄件者常很像，但內容、密碼規則、對帳目標完全不同：
> - **信用卡帳單** → 比對 `accounts.type='CREDIT'`，內容是各筆刷卡消費 → **本 skill 的目標**。
> - **銀行帳單** → 對應 `accounts.type='BANK'`，內容是存提匯款 → 不是這裡要對的東西。
> - 有些銀行（如中國信託「電子對帳單」）會把名下**多張卡甚至存款帳戶整合成一份 PDF**；解密後務必先確認抽到的是信用卡明細區塊，再開始比對。
>
> **判別方式：** 先看主旨／寄件者（「信用卡帳單」vs「存款／綜合對帳單」），仍不確定時，解密後讀 PDF 開頭的標題與欄位（有「交易日／入帳日／應繳金額」= 信用卡；有「存入／支出／結餘」= 銀行帳戶）。拿錯就會把整份對帳對到錯的 ZenBill 帳戶。

> 主旨關鍵字參考：信用卡 → `信用卡帳單`／`信用卡電子帳單`；綜合或存款 → `電子對帳單`／`綜合對帳單`／`存款對帳單`（需進一步確認內容）。

### Step 3 — 判定密碼規則（**讀信件，不要猜**）

台灣各家規則不同，且**信件內文一定會載明**。常見：身分證字號（部分碼）+ 生日、卡號末幾碼、出生年月日等。
從 Step 2 信件內文擷取規則，**原文呈現給使用者**，例如：「此 PDF 密碼為 身分證字號後四碼 + 西元出生月日（共 8 碼）」。

### Step 4 — 詢問使用者密碼（硬規則）

**絕不自行組合或猜測密碼。** 把信件寫明的規則讀給使用者聽，請使用者提供密碼本身（或組成密碼所需的數值），由使用者確認。密碼是敏感資料，僅用於本次解密，勿寫入任何檔案或 log。

### Step 5 — 解密 + 抽取明細

```bash
# 直接帶 user password 解密並輸出純文字
pdftotext -upw '<密碼>' -layout statement.pdf -
```

`-layout` 保留表格欄位對齊，較易抽出「交易日 / 入帳日 / 金額 / 商家」。表格抽取困難時改用 `pdf` skill（pdfplumber）。
抽出後整理成結構化清單：`{date, amount, merchant}`。

### Step 6 — 查 ZenBill 同期交易

用 `reconcile.py` 一次完成 Step 1+6（查卡 + 列出該期交易），或直接 SQL：

```bash
docker exec zenbill_postgres psql -U zenbill -d zenbill_prod -c \
"SELECT t.occurred_at::date, t.amount, COALESCE(m.name, t.note) AS payee, t.type
 FROM transactions t LEFT JOIN merchants m ON t.merchant_id=m.id
 WHERE t.account_id='<account_id>'
   AND t.occurred_at >= '<週期起>' AND t.occurred_at < '<週期迄+1天>'
 ORDER BY t.occurred_at;"
```

> 帳單金額 = 一般刷卡支出（`type='EXPENSE'`）。繳款扣款是 `TRANSFER`/auto-pay，不屬於帳單明細，比對時排除。

### Step 7 — 比對與輸出

以帳單為基準逐筆比對 ZenBill：

| 狀況 | 判定 |
|------|------|
| 帳單有、ZenBill 無 | **缺漏**（ZenBill 漏記） |
| 兩邊都有、金額不符 | **金額錯誤**（列出兩邊數字） |
| 兩邊都有、日期差 1~2 天 | 多半是交易日 vs 入帳日，視為相符（標註即可） |
| ZenBill 有、帳單無 | 提醒使用者（可能是其他卡 / 重複記 / 退刷） |

比對用「金額 + 日期相近 + 商家相似」做模糊配對，不要只靠完全相等。輸出一份清單讓使用者一眼看出要補哪幾筆。

### Step 8 — 信用卡回饋處理

帳單若列出當期「現金回饋 / 點數折抵 / 紅利」：**不要自動記帳**，先問使用者要怎麼記。常見選項提供給使用者選：
- 記為該卡的一筆 `INCOME`（收入）
- 折抵在當期某筆消費上（降低該筆金額）
- 不記（僅追蹤點數，不入帳）

依使用者選擇，用 `transactions.POST`（需 JWT）或直接寫 DB 建立交易。建立前覆述金額/日期/帳戶給使用者確認。

## Quick Reference

| 需求 | 指令 |
|------|------|
| 找信用卡帳戶 | 見 Step 1 SQL |
| 搜帳單信件 | `gws gmail ... messages list -q "..."` |
| 解密抽文字 | `pdftotext -upw '<pwd>' -layout f.pdf -` |
| 查同期交易 | `scripts/reconcile.py` 或 Step 6 SQL |

## Common Mistakes

- **自己猜密碼** → 一律讀信件規則 + 問使用者。
- **把繳款/auto-pay 當成消費比對** → 只比 `type='EXPENSE'`，排除 `TRANSFER`。
- **用日期完全相等比對** → 交易日 ≠ 入帳日，會誤判缺漏；用 ±2 天容差。
- **自動記錄回饋** → 必須先問使用者記法。
- **走 API 卻沒帶 JWT** → 讀取改用 DB 直查；寫入才需要 token。
- **密碼寫進檔案/log** → 只在當下指令使用，不落地。
- **跨卡混淆** → 一定先用卡名 `ILIKE` 鎖定唯一 `account_id` 再查交易。
- **把銀行帳單當信用卡帳單** → 銀行寄的「電子對帳單」可能是存款帳戶對帳單；先確認主旨／PDF 內容是信用卡明細（交易日／入帳日／應繳金額），再對到 `type='CREDIT'` 帳戶。整合型 PDF 還要先抓出信用卡區塊。
