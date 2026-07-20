# Debugging Report: debug-credit-card-cycle-expense-mismatch

Date: 2026-07-20
Debugger: Claude (Sonnet 5)

## Symptom
- Reported behavior：使用者在正式（production）環境查看「永豐Sports信用卡」6/16-7/15 這期帳單，頁面顯示「餘額」= 10843（使用者認為這是正確的本期帳單金額），但「本期支出」卻顯示 12666，兩者不一致。
- Expected behavior：「本期支出」（`cycleExpenseTotal`）應該與「餘額」（`RunningBalance` / `balanceAtEnd`）在同一組交易資料下互相印證，不應出現落差。
- Impact：使用者無法信任畫面上顯示的本期消費總額，可能影響對帳與繳款金額判斷。

## Reproduction
- Status: **not reproduced**（用真實 production 資料庫的交易明細手動重算兩個數字，皆與使用者回報的畫面數字對不上；已找到一個高度可疑但尚未證實的根因方向，詳見 Hypothesis）
- Steps:
  1. 於 `zenbill_prod` 資料庫找到帳戶「永豐Sports信用卡」（`accounts.id = f2b8a92c-d325-411f-8dea-d1fa6d77d911`，`closing_day = 15`，即時 `balance = -12386`）。
  2. 依前端 `getBillingCycle(15, offset)` 邏輯反推：使用者看到「6/16-7/15」這期，代表 `cycleOffset = -1`（因為系統目前日期 2026-07-20 已過 7/15 結帳日，`offset=0` 的「本期」實際上是 7/16-8/15）；對應 `prevCycle = 5/16-6/15`。
  3. 用後端實際查詢邏輯（`FindByAccountIDAndDateRangeWithDeferred` 的 WHERE 條件）在 `zenbill_prod` 資料庫手動重算「本期支出」應顯示的交易清單與加總。
  4. 用已修正的 `balanceAtEnd` 公式（`accountBalance - sumAfter(end) - sumDeferredOut(start,end)`）手動重算「餘額」。
- Environment: 直接對 `zenbill_postgres` 容器內的 `zenbill_prod` 資料庫下唯讀 SQL（`docker exec zenbill_postgres psql -U zenbill -d zenbill_prod ...`），未透過已認證的 API 呼叫（production API 需要 JWT，且本次未取得使用者授權去產生一組屬於該使用者的 token）。
- Test data / record IDs: 帳戶 `f2b8a92c-d325-411f-8dea-d1fa6d77d911`；本期（6/16-7/15）共 15 筆交易（14 筆非延期 + 1 筆延期出去：`91850026-b1c8-4db7-9951-5f912313615f`，EXPENSE 120，2026-07-15，`billing_period_deferred=true`）。

## Observation Plan
| Layer | Observation method | Evidence captured |
|---|---|---|
| Frontend/App | 讀 `frontend/src/pages/AccountDetailPage.tsx:150-158,528` 與 `app/app/accounts/[id].tsx:85-91,511` 原始碼，確認「本期支出」的唯一計算來源 | 兩端皆用 `transactions.reduce(...)` 對同一個 API 回傳的交易陣列加總（EXPENSE 加、INCOME 減、TRANSFER 略過），沒有其他名為「本期支出」的顯示位置（`grep -rn "本期支出"` 只有這兩處） |
| API/backend | 讀 `internal/delivery/http/transaction_handler.go:150-211`（`ListTransactions`）與 `internal/usecase/transaction_service.go:399-450`（`ListByAccountWithBalanceInDateRangeWithDeferred`） | 確認「本期支出」的資料來源（交易清單）與「餘額」的資料來源（`RunningBalance`）雖然來自同一次 API 呼叫，但走兩條獨立計算路徑：前者只依賴清單過濾（`FindByAccountIDAndDateRangeWithDeferred`，本次修正前後皆正確），後者依賴 `balanceAtEnd` 公式（今天才修正） |
| Database/persistence | 直接對 `zenbill_prod` 資料庫查詢該帳戶 6/16-7/15、5/16-6/15、7/15 之後的交易明細與 `billing_period_deferred` 旗標 | 見下方 Evidence；手動重算「本期支出」= 9311（不是 12666），手動重算「餘額」= -10843（絕對值 10843，與使用者回報相符） |
| Environment/build | `docker image inspect backend-api-prod --format '{{.Created}}'`、`docker inspect zenbill_api_prod --format '{{.Created}}'`、`docker history backend-api-prod` | **關鍵發現**：`backend-api-prod` image 建置時間為 `2026-06-15T16:42:52Z`，距今超過 5 週，且 `docker-compose.prod.yml` 的 `api-prod` 服務是編譯後的靜態 binary（`command: ["/app/api"]`，無 volume mount、無 air 熱重載），**代表 production API 目前執行的程式碼版本早於今天完成的 `balanceAtEnd` 修正**（修正 commits 皆為 2026-07-20），也早於本次的所有除錯與修正工作 |
| Environment/build | 對照 `zenbill_dev` 資料庫同一帳戶（同一 UUID）的交易明細 | `zenbill_dev` 的交易資料明顯是較舊的快照（缺少 7/9 之後多筆交易、完全沒有任何 `billing_period_deferred=true` 的交易、即時 balance 為 -9673 而非 -12386），代表 dev 與 prod 資料庫已經分岔，用 dev 資料重算「本期支出」（8141）與「餘額」皆與使用者回報的數字對不上，可以排除「使用者看到的其實是 dev/preview 環境」這個假設的直接證據強度 |

## Evidence
```text
$ docker exec zenbill_postgres psql -U zenbill -d zenbill_prod -c "
SELECT id, name, balance, closing_day FROM accounts WHERE name ILIKE '%sport%';"
f2b8a92c-d325-411f-8dea-d1fa6d77d911 | 永豐Sports信用卡 | -12386.0000 | 15

# 本期（6/16-7/15）交易清單（依 FindByAccountIDAndDateRangeWithDeferred 邏輯：本期排除 deferred=true，上期併入 deferred=true）
$ docker exec zenbill_postgres psql -U zenbill -d zenbill_prod -c "
SELECT SUM(CASE WHEN type='EXPENSE' THEN amount WHEN type='INCOME' THEN -amount ELSE 0 END) AS cycle_expense_total, COUNT(*)
FROM transactions
WHERE (account_id = 'f2b8a92c-...' OR target_account_id = 'f2b8a92c-...')
  AND ((occurred_at >= '2026-06-16' AND occurred_at <= '2026-07-15 23:59:59' AND billing_period_deferred = false)
    OR (occurred_at >= '2026-05-16' AND occurred_at <= '2026-06-15 23:59:59' AND billing_period_deferred = true));"
 cycle_expense_total | cnt
----------------------+-----
            9311.0000 |  14        <-- 與畫面上「本期支出 12666」不符，差 3355

# 期末後（>7/15）交易（用於 sumAfter）
ed9a917b... EXPENSE 635  2026-07-18 billing_period_deferred=true
f356d7d9... EXPENSE 788  2026-07-19 billing_period_deferred=true
sumAfter(end=7/15) = -(635+788) = -1423

# 本期內延期出去的交易（用於 sumDeferredOut，今天修正新增的計算）
91850026... EXPENSE 120  2026-07-15 billing_period_deferred=true
sumDeferredOut(6/16,7/15) = -120

# balanceAtEnd（今天修正後的公式）
balanceAtEnd = accountBalance - sumAfter - sumDeferredOut
             = -12386 - (-1423) - (-120)
             = -12386 + 1423 + 120
             = -10843            <-- 與畫面上「餘額 10843」相符

# balanceAtEnd（修正前的舊公式，理論上 production 目前應該還是跑這個）
old_balanceAtEnd = accountBalance - sumAfter
                  = -12386 - (-1423)
                  = -10963       <-- 與 10843 不符，差 120（正好是被延期交易的金額）

# Production image 版本確認
$ docker image inspect backend-api-prod --format '{{.Created}}'
2026-06-15T16:42:52.452023671Z
$ git -C backend log -1 --format="%H %cI %s"
2d3091922837b8969f5228d09f40ba48a2f4440d 2026-07-20T17:42:50+08:00 test: green - List and balance stay consistent for a mixed period
```

## Data Flow Trace
- 症狀觀察點：帳戶詳細頁「本期支出」數字（12666）。
- 目前為止能確認的第一個「對不上」的狀態：用 production 資料庫的真實資料，依照現有（且從未有 bug 的）清單加總公式重算「本期支出」得到 9311，不是使用者畫面上看到的 12666。
- 與此同時，「餘額」的重算結果（10843）**剛好**與今天才完成、且尚未部署到 production 的修正公式完全吻合，而 production 目前執行的 binary 明確早於今天的修正——這兩個觀察彼此矛盾，代表目前所知的事實還不足以唯一決定「使用者到底在看哪一個環境/哪一份資料」，需要使用者協助釐清（見 Next Action）。

## Working Reference
- Reference：`internal/usecase/transaction_deferred_balance_test.go` 的 4 個情境測試（皆針對記憶體內的假資料，非本次 production 真實資料），先前已驗證「清單加總」與「餘額往回推算」在混合延期情境下應該互相一致。
- Meaningful differences：本次用真實 production 資料重算後，「清單加總」（9311）與「餘額往回推算所隱含的清單金額」理論上應該一致（因為兩者用的是同一份 `allTxs`），但使用者回報的畫面數字（12666 vs 10843）彼此的差距（3355）跟我用同一份真實資料重算出的兩個「正確」數字之間的差距（9311 vs 10843，差 1532）也對不上，代表使用者畫面上看到的「本期支出」本身可能就不是這次除錯所分析的這份資料/這個計算路徑算出來的。

## Hypothesis
目前證據不足以支持單一確定的根因，因此**不猜測、不動手修正**，列出兩個尚待使用者確認的方向：

1. **環境不一致假說**：使用者看到的 APP／網頁畫面，實際連線的後端與資料庫，可能不是我這次直接查詢的 `zenbill_prod`（例如：APP 版本連到不同網域、Web 端用了瀏覽器快取的舊回應、或是有第三個目前未被列出的環境）。支持證據：production image 明確落後於今天的修正，但使用者回報的「餘額」數字卻精準符合修正後的公式，兩者矛盾，暗示這次修正**還沒有機會透過 production 部署影響使用者畫面**，那使用者看到的「10843」要嘛是巧合、要嘛來自別的路徑（例如已經手動重新整理拿到 dev/preview 環境的資料，但我用 dev 資料重算又對不上）。
2. **時間點不同步假說**：因為信用卡帳務資料可能被使用者本人在調查期間持續操作（例如反覆切換某幾筆交易的延期狀態），我下 SQL 查詢的當下資料快照，可能已經跟使用者截圖/觀察當下的資料狀態不同步，導致我算出來的「正確答案」跟使用者看到的畫面各自基於不同時間點的資料，因此對不起來。

## Next Action（已更新：使用者已確認並同意部署）
- 使用者確認畫面來源：**APP 正式版**（`com.zenbill.app`，連線 `zenapi.bibiota.com`）。
- 追查網路路徑確認：`zenapi.bibiota.com` → cloudflared tunnel（`/etc/cloudflared/config.yml`）→ `localhost:8888` → nginx（`/opt/homebrew/etc/nginx/servers/zenbill.conf:25` `proxy_pass http://127.0.0.1:8091`）→ `zenbill_api_prod` 容器。確認使用者的正式 APP 100% 打到本次查驗的同一個 `zenbill_prod` 資料庫與同一個（先前確認為 5 週前舊版本的）後端容器，排除「連到不同環境」的假說。
- 已取得使用者明確同意，執行部署：
  ```
  $ docker compose -f docker-compose.yml -f docker-compose.prod.yml build api-prod worker-prod
  ...
  Image backend-worker-prod Built
  Image backend-api-prod Built

  $ docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api-prod worker-prod
  Container zenbill_api_prod Recreated
  Container zenbill_worker_prod Recreated
  ...
  Container zenbill_api_prod Started
  Container zenbill_worker_prod Started

  $ docker image inspect backend-api-prod --format '{{.Created}}'
  2026-07-20T10:22:41.585924887Z   <-- 新 image，包含今天的 balanceAtEnd 修正

  $ curl -s https://zenapi.bibiota.com/health
  {"env":"production","service":"ZenBill","status":"ok"}
  ```
- 部署後重新查驗同一帳戶（`f2b8a92c-...`）同一期間（6/16-7/15）的資料，確認底層交易資料在部署前後完全沒有變動（`balance` 仍為 -12386，15 筆交易明細完全一致），代表部署前後的任何數字差異都只來自程式碼修正本身，不是資料被同時修改造成的干擾。
- Route to: 已完成部署，回報使用者用正式版 APP 重新整理帳戶頁確認畫面數字是否已更新為 `balanceAtEnd` 修正後的值（餘額應為 10843，與使用者最初回報的觀察一致）。
- 仍待釐清（非本次除錯範圍，留待使用者決定是否要繼續查）：`cycleExpenseTotal`（本期支出）前端計算目前完全忽略 TRANSFER 類型交易（`frontend/src/pages/AccountDetailPage.tsx:150-158` 與 `app/app/accounts/[id].tsx:85-91` 的 `reduce` 對 TRANSFER 直接 `return sum`，不做任何加減），而「餘額」計算對 TRANSFER 有正確處理（轉入本帳戶視為還款、減少負債）。這筆帳戶本期恰好有一筆 7/1 的 1962 元轉入交易，如果「本期支出」的語意應該要是「本期淨應付金額」而非「單純消費總和」，這個 TRANSFER 被忽略的處理方式可能是「本期支出」與「餘額」兩個數字語意上不完全對齊的另一個原因，值得使用者確認產品需求後再決定是否要修正。
