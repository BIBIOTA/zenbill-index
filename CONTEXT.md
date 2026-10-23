# ZenBill

自動化記帳系統。本檔案只放**詞彙**：專屬於這個專案、且曾經被誤解或撞名的概念。不放實作細節、不放規格、不放待辦。

## Language

### 共同記帳

**共同帳本 (Shared Ledger)**:
兩個人之間的分帳帳本，角色固定為一位 owner 與一位 partner。可綁定一份 Google Sheet 作為雙向同步的對象。

**共同支出 (Shared Expense)**:
共同帳本裡的一筆支出，記錄總額、誰付了多少、以及如何拆分。
_Avoid_: 交易、Transaction（那是個人帳務的詞，見下）

**個人交易 (Transaction)**:
記在使用者自己帳戶上、會牽動 `accounts.balance` 的一筆帳。一筆共同支出**可能**連帶產生一筆個人交易，但兩者是不同的東西。
_Avoid_: 支出、Expense

### 付款相關（三個容易撞在一起的詞）

**入帳帳戶 (Payment Account)**:
owner 自己的 ZenBill 帳戶，決定一筆共同支出轉成個人交易時要扣哪個帳戶。是真實帳戶的參照，會影響餘額。
_Avoid_: 付款方式、付款帳戶

**Partner 付款方式 (Partner Payment Method)**:
partner 用什麼支付工具付款的**文字標籤**，值來自共同帳本所綁 Google Sheet 的 `付款方式` 分頁。純記錄，不指向任何 ZenBill 帳戶、不影響任何餘額。UI 上顯示為該帳本 partner 的實際名字。
_Avoid_: 付款帳戶、支付方式、Zumi 付款方式

**標籤 (Label) vs 綁定 (Binding)**:
本專案反覆出現的區分。**標籤**是原封不動存下來的字串，值域由外部（使用者、Sheet）決定，ZenBill 不理解其意義也不驗證；**綁定**是指向 ZenBill 內部實體的參照，有引用完整性、會牽動計算。「Partner 付款方式」是標籤，「入帳帳戶」是綁定。

### Google Sheet 同步

**表單分頁 (表單)**:
共同帳本綁定的 Google Sheet 中，作為主要資料列來源的分頁。它同時是一份 Google 表單的回應表，因此 ZenBill 不是唯一的寫入者。

**分帳分頁 (分帳)**:
以 `IMPORTRANGE` 鏡射「表單」分頁、並在右側附加分析欄位的分頁。它是衍生資料，ZenBill 從不寫入。

**同步列索引 (Google Sheet Row Index)**:
一筆共同支出對應到「表單」分頁的第幾列。只有被推送過的支出才有。

### 幣別金額（精度與倍數）

**顯示值 vs 儲存值 (Display value vs Stored value)**:
使用者在表單輸入、以及畫面上看到的是**顯示值**；寫進 `transactions.amount` / `accounts.balance` 的是**儲存值**，兩者的關係是 `儲存值 = 顯示值 × 倍數`。本專案所有精度規則都定義在**儲存值**上。
_Avoid_: 「金額」單獨使用（在倍數 ≠ 1 的幣別會指涉不清）

**倍數 (Multiplier)**:
使用者為某幣別設定的換算倍數，用來縮短輸入（例如 VND 設 1000，輸入 `50.5` 代表 50,500）。屬於**輸入便利性**，與這個幣別實際有幾位小數無關。
_Avoid_: 匯率（那是跨幣別轉帳用的，見下）

**小數位數 (Decimal Places) / 精度 (Precision)**:
某幣別的儲存值容許幾位小數。解析順序為：使用者設定（`user_currency_settings.decimal_places`，可為 null）→ 內建覆寫（TWD / JPY / KRW / VND = 0）→ ISO 4217 → 2。同時決定輸入限制、跨幣別換算的四捨五入、以及顯示位數。後端只驗證欄位範圍（0～4），不做換算與四捨五入。
_Avoid_: 用倍數反推位數（倍數是 `decimal(19,4)`，不保證是 10 的次方）

**匯率 (Exchange Rate)**:
跨幣別轉帳時 `來源金額 / 目標金額` 的比值。金額依精度四捨五入後**不回推**匯率，維持使用者輸入或 API 預填的原值。

### 信用卡帳單

**帳單 (Statement)**:
銀行為一張卡的一個帳單週期寄出的帳單，在 ZenBill 存成 `credit_card_statements` 的一列，以 `(account_id, cycle_end)` 唯一。`cycle_end` 是 ZenBill 依 `closing_day` 算出的週期結束日，**不是**銀行印的結帳日（`closing_day` 刻意比銀行早，用來配合消費日切期）。多幣別卡在 ZenBill 拆成幾個帳戶，帳單就各存一列。帳單不牽動 `accounts.balance`。
_Avoid_: 對帳單（那可能是存款帳戶的）、明細（帳單不存逐筆交易）

**應繳總額 (Amount Due)**:
某一期帳單「這次要繳多少」，對齊銀行帳單上的「本期應繳總額」：包含上期未繳清的結轉，並扣掉溢繳。總覽待繳、帳戶頁待繳、繳卡費預設金額、自動扣款金額，都用這個數字。
_Avoid_: 本期支出、本期消費（那不含結轉）

**本期消費 (Cycle Spending)**:
一個帳單週期內的淨消費：EXPENSE − INCOME − SETTLEMENT，套用延到下期（`billing_period_deferred`）。**TRANSFER 不論方向一律不計入**，因為信用卡的 TRANSFER 是繳上一期的錢。只在帳戶頁的週期導覽器顯示。舊名「本期支出」。
_Avoid_: 應繳、本期支出

**確定 vs 預估 (Confirmed vs Estimated)**:
有帳單時，應繳總額就是帳單上的數字，稱為**確定**。沒有帳單時，由 ZenBill 計算 `本期消費 + 結轉`，稱為**預估**。帳單數字和預估之間的差額是對帳訊號（漏記、記錯，或消費日和入帳日的落差），只顯示，不自動修正交易。

**結轉 (Carryover)**:
前一期**確定**帳單的應繳總額，減掉該帳單繳款期間（結帳日次日到下一個結帳日）轉入的 TRANSFER。可能是負數（溢繳，或結帳日前提前繳款）。前一期沒有確定帳單時，結轉為 0，不往回遞迴推算。
