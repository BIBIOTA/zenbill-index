# @zenbill/mcp-server

透過 MCP 讓 AI Agent 用自然語言操作 ZenBill 的**共同記帳**，以及（另簽 scope 後）記**個人支出**、查**回饋方案進度**。

```
「記一筆昨天跟 Zumi 吃飯 800 對半分」
「我們這個月分帳我還欠多少？」
「刪掉剛才那筆」
「（收據照片）熊本熊」→ 整理成一筆支出，確認後寫入
「熊本熊指定店還能刷多少？」
```

## Agent 能做什麼、不能做什麼

### 共同記帳（`shared_ledger:read`、`shared_expense:write`）

| 能 | 不能 |
|---|---|
| 列出、讀取共同帳本 | 建立／修改／刪除帳本 |
| 查看總覽與應收餘額 | 產生邀請連結、觸發 Sheet 同步、改暱稱 |
| 讀取、新增、刪除分帳明細 | 讓分帳明細連動到任何個人帳戶或交易 |
| | 刪除已連動個人交易的明細 |
| | 存取發票、帳戶、交易、股票、TPASS、通知（除非另簽下方 scope） |

### 個人支出與回饋方案（ADR 0005，需另簽 scope）

| 能 | 不能 |
|---|---|
| 列出帳戶、商家、分類 | 新增 INCOME、TRANSFER，或綁發票 |
| 新建商家 | 修改／刪除**人建的**交易 |
| 新增 **EXPENSE**（餘額同步更新） | 對人建的交易做回饋方案標記 |
| 修改／刪除 **agent 自己建的**支出 | 刪除已屬於共同支出的交易 |
| 查回饋方案進度；對自己建的支出標記計入 | 建立／修改回饋方案 |

這些限制**由後端強制執行**。這個 MCP server 不提供帳本寫入工具、工具參數也不暴露 `payment_account_id` 之類的欄位，但那只是縱深防禦——安全性不依賴這一層。

## 設定

### 1. 簽發 agent token

```bash
docker exec -it zenbill_api /app/agent_token issue \
  --user <你的 user UUID> \
  --name claude-code \
  --scopes shared_ledger:read,shared_expense:write \
  --days 90
```

要讓 agent 記個人支出、查回饋進度，**另簽一把**（不要擴充舊 token；見 ADR 0005）：

```bash
docker exec -it zenbill_api /app/agent_token issue \
  --user <你的 user UUID> \
  --name openclaw-receipts \
  --scopes transaction:write,account:read,merchant:write,reward:read,reward:mark \
  --days 30
```

| scope | 開放 |
|---|---|
| `transaction:write` | 新增 EXPENSE、改刪 agent 建的交易、查相似交易、讀分類 |
| `account:read` | 列出／讀取帳戶 |
| `merchant:write` | 列出、新建商家 |
| `reward:read` | 方案與進度 |
| `reward:mark` | 對 agent 建的交易做計入標記（`create_expense` 的 `reward_plan_ids` 需要） |

兩組 scope 可以放在同一把 token，也可以分開兩個 MCP server 實例各用一把；工具不會因缺 scope 而消失，只是呼叫時回 `missing required scope`。

明文 token（`zbat_` 開頭）**只會顯示這一次**，立刻存起來。

其他指令：

```bash
docker exec -it zenbill_api /app/agent_token list --user <uuid>
docker exec -it zenbill_api /app/agent_token revoke --id <token uuid>
```

### 2. 建置

```bash
pnpm --filter @zenbill/mcp-server build
```

### 3. 接上 MCP client

**Claude Code**（`.mcp.json` 或 `claude mcp add`）:

```json
{
  "mcpServers": {
    "zenbill": {
      "command": "node",
      "args": ["/Users/yuki/projects/zen-bill/packages/mcp-server/dist/index.js"],
      "env": {
        "ZENBILL_API_URL": "http://localhost:8090/api/v1",
        "ZENBILL_AGENT_TOKEN": "zbat_..."
      }
    }
  }
}
```

**Claude Desktop**（`claude_desktop_config.json`）格式相同。

| 環境變數 | 預設 | 說明 |
|---|---|---|
| `ZENBILL_AGENT_TOKEN` | 無（必填） | `agent_token issue` 產生的明文 token |
| `ZENBILL_API_URL` | `http://localhost:8080/api/v1` | API 位址，需含 `/api/v1` |

## 工具

| 工具 | 用途 |
|---|---|
| `list_shared_ledgers` | 列出帳本，取得後續工具需要的 `ledger_id` |
| `get_shared_ledger_summary` | 總支出、雙方分攤、應收餘額 |
| `list_shared_expenses` | 列出明細，支援 `from`／`to` 日期區間（月結對帳用） |
| `create_shared_expense` | 新增明細，回應會重述分攤結果供當場核對 |
| `delete_shared_expense` | 刪除明細 |

個人支出與回饋方案：

| 工具 | 參數 | 用途 |
|---|---|---|
| `list_accounts` | `include_archived?` | 帳戶 id、類型、幣別、餘額、結帳日 |
| `list_merchants` | `query?`、`limit?` | 搜尋商家，附預設分類／帳戶／國家 |
| `create_merchant` | `name`、`default_category_id?`、`default_account_id?`、`default_country?` | 新建商家（同名回 400） |
| `list_categories` | `include_income?` | 支出分類樹 |
| `find_similar_transactions` | `account_id`、`date`、`amount` | 查重複：同帳戶、同日、`amount` 或 `original_amount` 相同 |
| `create_expense` | `account_id`、`date`、`amount`、`category_id?`、`merchant_id?`、`note?`、`original_amount?`、`original_currency?`、`exchange_rate?`、`country_override?`、`reward_plan_ids?` | 新增 EXPENSE；逐一標記方案計入，回報標記結果、新餘額、寫入後各方案進度 |
| `update_agent_expense` | `transaction_id` + 任一欄位（`date`、`amount`…；`country_override: null` 清除） | 改 agent 建的支出 |
| `delete_agent_expense` | `transaction_id` | 刪 agent 建的支出（餘額還原） |
| `list_reward_progress` | `account_id?`、`offset?`（需 `account_id`） | 方案進度總覽：已刷、上限、剩餘可刷、預估回饋 |
| `get_reward_plan_progress` | `plan_id`、`offset?`、`transactions?`（`none`/`included`/`all`）、`limit?` | 單一方案某期進度，可列計入／不計入明細 |
| `get_reward_summary` | `account_id`、`from?` + `to?`（成對）或 `period?`（`current`/`previous`）、`scope?`（`all`/`overseas`） | 總回饋率：同一張卡（共用方案的帳戶）在區間內的預估總回饋、消費、毛回饋率、扣國外交易服務費後的淨回饋率，與各方案貢獻（封頂標 `[CAPPED]`）；唯讀 |

**金額是帳戶幣別的儲存值**：日幣帳戶記日圓（¥1000 → `amount: 1000`）；台幣卡在國外刷，`amount` 記台幣，另帶 `original_amount` + `original_currency`。方案進度一律以方案幣別計，未扣除退款。

`create_expense` 的方案標記是建立後**另外**的請求：標記失敗時支出**已經寫入**，工具會列出哪個方案失敗，agent 不該重建那筆支出。

## ⚠️ 請讓你的 partner 知道這件事

**Agent 刪除分帳明細時，會連動刪除共享 Google Sheet 上對應的那一列。**

partner 會看到資料從 Sheet 上消失，而那既不是他本人的操作，也不是你在 App 裡的操作。這是經評估後**明確接受**的行為，不是 bug。

事後可追查：每一筆明細都記錄了 `created_by_actor` 與 `deleted_by_actor`（`user` 或 `agent`），API 端也會為每個 agent 請求輸出結構化稽核日誌（token ID、method、path、狀態）。

## 錯誤訊息

| 狀況 | Agent 會收到 | 該怎麼辦 |
|---|---|---|
| Token 已撤銷／過期 | 提示重新簽發 | 跑 `agent_token issue` |
| 缺少 scope | `missing required scope: ...` | 用正確的 scope 重簽 |
| 端點不開放給 agent | `not available to agent tokens` | 這件事只能在 App 裡做 |
| 刪除已連動交易的明細 | `linked to a personal transaction; delete it from the ZenBill app instead` | 到 App 刪除該筆 |
| 新增 INCOME／TRANSFER | `agent tokens can only record expenses (EXPENSE); …` | 到 App 記 |
| 改、刪、標記人建的交易 | `agent tokens can only change/mark transactions an agent created; …` | 到 App 改 |
| 刪除屬於共同支出的交易 | `this transaction belongs to a shared expense; delete it in the app` | 到 App 刪 |

401（憑證失效）與 403（不被允許）刻意分開——前者要換 token，後者換 token 沒有用。

## 實作註記

- **日期區間在此端過濾。** 後端 `GET /expenses` 只支援分頁，沒有日期參數。本 server 逐頁抓取後過濾，最多走 20 頁（每頁 100 筆）。若帳本很大且區間很舊，可能觸及上限。
- **API 回傳 RFC3339 時間戳**（`2026-05-31T00:00:00Z`），呼叫端給的是純日期。比較前一律用 `dayOf()` 截成日曆日，否則區間上界會少一天。
- **`date` 參數轉成 `YYYY-MM-DDT00:00:00Z`** 送給交易 API，與 App 既有資料的形狀一致。
- **`create_expense` 的寫入後進度**取該筆日期所在那一期（先試 offset 0，不在期間內再試 -1）。
- **型別在本套件內定義**，未重用 `@zenbill/shared`：該套件進入點 re-export React hooks 且沒有 build 產物，Node ESM 建置無法消費。
