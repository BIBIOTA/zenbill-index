# Partner 付款方式是標籤，不綁定 ZenBill 帳戶

共同支出上的「partner 付款方式」記錄的是 partner 用哪個支付工具付款（例如「信用卡(玉山)」、「Linepay(玉山)」），值域來自共同帳本所綁 Google Sheet 的 `付款方式` 分頁。我們決定把它存成一個不受約束的**字串標籤**（`shared_expenses.partner_payment_method`），而不是指向 `accounts` 的外鍵。

## Considered Options

**綁定 `accounts`（否決）**：ZenBill 已經有帳戶模型，而且同一個 struct 裡的 `PaymentAccountID`（入帳帳戶）正是這種綁定，所以外鍵看起來是自然的選擇。否決的理由有三個：這個欄位記的是 **partner** 的支付工具，而 partner 的卡片和電子支付在 ZenBill 裡根本沒有對應的 account，一半以上的值無處可綁；值域是使用者可自由編輯的 Google Sheet 分頁，隨時能新增或刪除一列，外鍵的引用完整性會被外部編輯打破；而且綁定會讓共同記帳耦合到個人帳戶模型，是難以回頭的方向。

**標籤（採用）**：ZenBill 原封不動存下來、原封不動同步出去，不驗證值是否仍存在於清單中。Sheet 上刪掉某個選項時，引用它的歷史資料仍然合法。

## Consequences

- 這個欄位**不影響任何餘額、不參與任何計算**，純記錄。
- UI 用下拉選單引導使用者選出合法值，但那是引導不是約束；從 Google Sheet 同步回來的值一律照收。
- 若日後真的需要「partner 的付款方式 → 某個帳戶」的關聯，做法是另加一層 label→account 對照表，不要把這個欄位改成外鍵。
