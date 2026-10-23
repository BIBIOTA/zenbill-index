# Fetch a credit-card statement PDF from Gmail

共用流程：`credit-card-statement-reconcile` 與 `credit-card-statement-import` 都從這裡取得帳單文字。
輸入：銀行、卡別、帳單月份。輸出：該張**信用卡帳單**的 `pdftotext -layout` 純文字（只在記憶體／對話中，不落地）。

完成條件：手上有解密後的文字，且已確認它是信用卡帳單、是指定的月份、涵蓋指定的卡。

## A — 找帳單信件（gws）

```bash
gws gmail users messages list --params '{"userId":"me","q":"<銀行> 信用卡 電子帳單 after:YYYY/MM/DD before:YYYY/MM/DD has:attachment","maxResults":5}'
```

調整 `q`：用寄件者網域（如 `from:sinopac.com`）+ 主旨關鍵字更精準。找到後取信件內文：

```bash
gws gmail users messages get --params '{"userId":"me","id":"<msgId>","format":"full"}'
```

附件下載：從信件取得 `attachmentId`，用 `gws gmail users messages attachments get` 存檔成 PDF。
`--output <path>` 不一定會寫出檔案：base64 的 `data` 可能只出現在印出的 JSON 裡。檔案是空的或不存在時，從那段 JSON 取 `data`（base64url）自行解碼成 PDF。PDF 存在 scratchpad。

> ⚠️ **帳單分兩種：銀行帳單 vs 信用卡帳單，別拿錯。**
> 銀行寄的「電子對帳單／電子帳單」可能是 **存款帳戶對帳單（銀行帳單）**，也可能是 **信用卡帳單**，兩者主旨和寄件者常很像，但內容、密碼規則、對帳目標完全不同：
> - **信用卡帳單** → 對應 `accounts.type='CREDIT'`，內容是各筆刷卡消費 → **我們要的東西**。
> - **銀行帳單** → 對應 `accounts.type='BANK'`，內容是存提匯款 → 不是這裡要的東西。
> - 有些銀行（如中國信託「電子對帳單」）會把名下**多張卡甚至存款帳戶整合成一份 PDF**；解密後務必先確認抽到的是信用卡區塊，再往下做。
>
> **判別方式：** 先看主旨／寄件者（「信用卡帳單」vs「存款／綜合對帳單」），仍不確定時，解密後讀 PDF 開頭的標題與欄位（有「交易日／入帳日／應繳金額」= 信用卡；有「存入／支出／結餘」= 銀行帳戶）。拿錯就會把整份帳單對到錯的 ZenBill 帳戶。

> 主旨關鍵字參考：信用卡 → `信用卡帳單`／`信用卡電子帳單`；綜合或存款 → `電子對帳單`／`綜合對帳單`／`存款對帳單`（需進一步確認內容）。

## B — 判定密碼規則（**讀信件，不要猜**）

台灣各家規則不同，且**信件內文一定會載明**。常見：身分證字號（部分碼）+ 生日、卡號末幾碼、出生年月日等。
從 A 的信件內文擷取規則，**原文呈現給使用者**，例如：「此 PDF 密碼為 身分證字號後四碼 + 西元出生月日（共 8 碼）」。

## C — 詢問使用者密碼（硬規則）

**絕不自行組合或猜測密碼。** 把信件寫明的規則讀給使用者聽，請使用者提供密碼本身（或組成密碼所需的數值），由使用者確認。
密碼是敏感資料，只用在當次解密指令的參數裡：不寫進任何檔案、script、log 或記憶。同一批有多封帳單時，每封各自依規則問。

## D — 解密 + 抽文字

```bash
# 直接帶 user password 解密並輸出純文字
pdftotext -upw '<密碼>' -layout statement.pdf -
```

`-layout` 保留表格欄位對齊，較易抽出「交易日 / 入帳日 / 金額 / 商家」與帳單摘要欄位。表格抽取困難時改用 `pdf` skill（pdfplumber）。
解密後只輸出文字到 stdout，不另存解密後的 PDF。skill 結束時刪掉 scratchpad 裡下載的 PDF。
