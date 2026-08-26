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
