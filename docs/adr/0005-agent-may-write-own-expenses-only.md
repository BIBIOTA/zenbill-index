# Agent 只能新增支出，只能改刪自己建的交易

Agent 存取共同記帳（`.scratch/agent-shared-ledger-access.md`）當初劃了一條界線：agent token 的權限**封閉在共同記帳領域內**，碰不到個人帳戶與交易——連分帳明細都不准連動付款帳戶，因為那等於「任意帳戶餘額寫入權」。回饋方案與封頂追蹤要讓 OpenClaw agent 在旅途中把收據照片整理成交易、確認後寫入，並回報各方案還能刷多少，這條界線必須放寬。我們決定只放寬到一個很窄的形狀：**另簽一把新 token**，用新的 scope；agent 只能新增 **EXPENSE**，只能修改、刪除、標記 `created_by_actor = agent` 的交易；所有寫入都走既有的 transaction usecase，讓 `accounts.balance` 在同一個 DB transaction 內更新。

具體規則：

- 新 scope：`transaction:write`（POST EXPENSE；PUT／DELETE 只限 agent 建的；查相似交易；讀分類）、`account:read`、`merchant:write`（列出、新建商家）、`reward:read`、`reward:mark`（只對 agent 建的交易標記）。舊 token 不擴充，舊的 `shared_ledger:*` scope 意義不變。
- TRANSFER、INCOME、`target_account_id`、`invoice_id`、把 agent 建的交易改成非 EXPENSE，一律 403；改、刪、標記人建的交易 403；刪除屬於共同支出的交易 403。403 訊息寫成可轉述給使用者的理由（「到 App 裡做」）。
- `transactions` 新增 `created_by_actor`、`updated_by_actor`（沿用 shared_expense 的做法），既有資料一律是 `user`。App／Web 用它顯示 agent 徽章。
- MCP server 的工具說明重述這條界線，但只是縱深防禦，真正的閘門在後端。

## Considered Options

**維持原界線，agent 只輸出草稿讓使用者到 App 輸入（否決）**：最安全，但旅途中一次幾十張收據，逐筆在 App 重打正是這個功能要解決的事。

**擴充既有 token 的 scope（否決）**：已經發給 Claude Code 等環境的 token 會默默取得個人帳戶寫入權，使用者當初同意的範圍被改變。新 token 讓授權是一個明確、可單獨撤銷的動作。

**開放完整交易 CRUD（否決）**：TRANSFER 牽動兩個帳戶的餘額、INCOME 與發票連動各有自己的規則，agent 誤判的代價是難以察覺的餘額錯誤。收據匯入只需要 EXPENSE。

**只限新增、不給修改刪除（否決）**：agent 記錯了就只能請使用者到 App 收拾。限定在 agent 自己建的交易上，讓 agent 能撤銷自己的錯，卻碰不到使用者記的帳。

**agent 直寫 DB 或另開一條寫入路徑（否決）**：`accounts.balance` 是寫入路徑上逐筆維護的快取，繞過 usecase 就會失衡（見 CLAUDE.md「已知坑點」）。

## Consequences

- 「agent 碰不到個人帳戶」不再成立：持有新 token 的 agent 可以讓任何帳戶的餘額因新增支出而減少，也能讀到所有帳戶與餘額。外洩時的損害上限是「多出一些 agent 標記的支出」，可從 `created_by_actor` 找出並刪除；token 可撤銷、會過期。
- 授權依據是**誰建立的**，不是**誰最後改的**：使用者在 App 裡改過一筆 agent 建的交易後，agent 仍然可以改刪它。若日後要讓使用者「接手」一筆交易，需要另外的規則，這份決策不涵蓋。
- 方案標記（`reward:mark`）只限 agent 建的交易，所以 agent 無法替使用者手動計入或排除人記的帳；建立支出與標記是分開的請求，標記失敗時支出已經存在，MCP 工具必須回報哪個方案失敗而不是重試建立。
- 新增任何 agent 可達的路由都要改 `AgentScopePolicy` 的白名單測試，避免 scope 範圍無意間擴大。
