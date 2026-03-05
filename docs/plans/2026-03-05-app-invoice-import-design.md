# APP 發票匯入功能設計

## 目標

在 APP 中實作與 Web 完全一致的發票匯入流程，讓使用者可以從發票直接建立交易記錄。

## 現狀

- **Web**：發票列表有「匯入」按鈕 → 規則匹配 → 預填交易表單 → 快速建立商家 → 規則建立提示
- **APP**：發票列表只有批次狀態更新，無匯入功能

## 流程

```
發票列表點「匯入」按鈕（PENDING 狀態）
  → POST /invoices/:id/match（規則引擎匹配商家/分類/帳戶）
  → 跳轉 /transactions/new（帶預填資料）
  → TransactionForm 預填金額、日期、備註、商家、分類、帳戶
  → 若無匹配商家但有 sellerName → 自動開啟 MerchantQuickCreate
  → 儲存交易（payload 包含 invoice_id）
  → 若 sellerName ≠ 所選商家名稱 → 顯示 RuleCreatePrompt（Bottom Sheet）
  → 完成，返回發票列表
```

## 修改檔案

### 1. `app/app/(tabs)/invoices.tsx`

- 新增 `useMatchInvoice` hook
- 每筆 PENDING 發票卡片加「匯入」按鈕
- 點擊匯入時：
  1. 呼叫 match API
  2. 組合 defaultValues（type, amount, date, note from raw_details）
  3. router.push 到 /transactions/new，params 帶 invoiceId、defaultValues（JSON）、sellerName
- 匹配中顯示 loading 狀態
- `formatInvoiceNote(inv)` 函式：將 raw_details 格式化為備註文字

### 2. `app/app/transactions/new.tsx`

- 從 `useLocalSearchParams` 讀取 `invoiceId`、`defaultValues`、`sellerName`
- JSON.parse defaultValues
- 傳入 TransactionForm
- 頁面標題：有 invoiceId 時顯示「從發票建立交易」

### 3. `app/components/transactions/TransactionForm.tsx`

新增 Props：
```typescript
interface Props {
  transaction?: Transaction
  defaultAccountId?: string
  invoiceId?: string
  defaultValues?: {
    type?: TransactionType
    amount?: number
    amountStr?: string
    occurred_at?: string
    note?: string
    merchant_id?: string
    category_id?: string
    account_id?: string
  }
  sellerName?: string
}
```

行為變更：
- 初始化 state 時優先使用 defaultValues
- handleSubmit 中若有 invoiceId，payload 加上 `invoice_id`
- 若有 sellerName 且無匹配 merchant_id → 自動開啟 MerchantQuickCreate（initialName=sellerName）
- 儲存成功後：若 sellerName 存在且 ≠ 所選商家名稱 → 顯示 RuleCreatePrompt

### 4. 新增 `app/components/invoices/RuleCreatePrompt.tsx`

使用 `@gorhom/bottom-sheet` Bottom Sheet。

Props：
```typescript
interface Props {
  visible: boolean
  sellerName: string
  merchantId: string
  merchantName: string
  onDone: () => void
}
```

UI：
- 標題：「建立商家規則」
- 說明：「是否將『{sellerName}』自動對應到商家『{merchantName}』？」
- 副說明：「建立後，未來同樣商家名稱的發票將自動匹配。」
- 按鈕：「跳過」（onDone）、「建立規則」
- 建立規則：`useCreateRule({ merchant_id, keyword: sellerName, match_type: 'CONTAINS', priority: 0 })`

## 資料傳遞

使用 expo-router search params：

```typescript
router.push({
  pathname: '/transactions/new',
  params: {
    invoiceId: inv.id,
    defaultValues: JSON.stringify({
      type: 'EXPENSE',
      amount: inv.total_amount,
      amountStr: String(inv.total_amount),
      occurred_at: inv.invoice_date.split('T')[0],
      note: formatInvoiceNote(inv),
      merchant_id, category_id, account_id,
    }),
    sellerName: inv.seller_name,
  },
})
```

## 後端 API

不需修改。所有端點已存在：
- `POST /invoices/:id/match` — 規則匹配
- `POST /transactions` — 建立交易（支持 invoice_id）
- `POST /rules` — 建立規則

## 共用 hooks

已存在於 `@zenbill/shared`：
- `useMatchInvoice` — 規則匹配
- `useCreateRule` — 建立規則
- `useCreateTransaction` — 建立交易（已支持 invoice_id）

## 已有元件

- `MerchantQuickCreate` — 已存在，支持 `initialName` prop
- `CategoryQuickCreate` — 已存在
- `AccountQuickCreate` — 已存在
