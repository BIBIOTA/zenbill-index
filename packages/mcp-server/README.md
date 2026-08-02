# @zenbill/mcp-server

透過 MCP 讓 AI Agent 用自然語言操作 ZenBill 的**共同記帳**。

```
「記一筆昨天跟 Zumi 吃飯 800 對半分」
「我們這個月分帳我還欠多少？」
「刪掉剛才那筆」
```

## Agent 能做什麼、不能做什麼

| 能 | 不能 |
|---|---|
| 列出、讀取共同帳本 | 建立／修改／刪除帳本 |
| 查看總覽與應收餘額 | 產生邀請連結、觸發 Sheet 同步、改暱稱 |
| 讀取、新增、刪除分帳明細 | 讓分帳明細連動到任何個人帳戶或交易 |
| | 刪除已連動個人交易的明細 |
| | 存取發票、帳戶、交易、股票、TPASS、通知 |

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

401（憑證失效）與 403（不被允許）刻意分開——前者要換 token，後者換 token 沒有用。

## 實作註記

- **日期區間在此端過濾。** 後端 `GET /expenses` 只支援分頁，沒有日期參數。本 server 逐頁抓取後過濾，最多走 20 頁（每頁 100 筆）。若帳本很大且區間很舊，可能觸及上限。
- **API 回傳 RFC3339 時間戳**（`2026-05-31T00:00:00Z`），呼叫端給的是純日期。比較前一律用 `dayOf()` 截成日曆日，否則區間上界會少一天。
- **型別在本套件內定義**，未重用 `@zenbill/shared`：該套件進入點 re-export React hooks 且沒有 build 產物，Node ESM 建置無法消費。
