# TPASS / 悠遊卡同步 — 手動驗證紀錄（Task 6.4）

> 本文件對應 task 6.4 的第二項驗收條件：將每個必要 UI 狀態對應到實作（Web + APP）與 Figma frame，並記錄驗證狀態。
>
> **誠實聲明：** 本紀錄由實作 subagent 產出，能做到的是「Code-verified」——以實際檔案 file:line 對照 Figma 設計與 spec 確認結構/欄位/資料來源正確。**無法**做到在真機 RN App 與瀏覽器上跑真實後端的 live runtime 簽核（互動、視覺、邊界資料）。Live 簽核屬使用者責任，列於文末「PENDING USER」章節。
>
> 欄位說明：
> - **State**：設計要求的畫面狀態。
> - **Figma frame**：`designs/figma.md` 對應的 frame node。
> - **Implementation**：Web（`frontend/`）與 APP（`app/`）對應檔案與行號。
> - **Code-verified?**：是否已 file:line 對照設計確認結構與資料來源。
> - **Live sign-off**：真機/瀏覽器跑真實後端的人工驗證（使用者待辦）。

---

## 1. 設定入口（Settings entry list）— frame 5:2

| State | Figma frame | Implementation (web / app) | Code-verified? | Live sign-off |
|---|---|---|---|---|
| 入口列表含「電子發票 / TPASS 2.0 悠遊卡 / 幣別」三項 | 5:2 | web `frontend/src/pages/SettingsPage.tsx:43-62`（三個 `SettingsRow`）/ app `app/app/settings/index.tsx:27-46` | 是 | PENDING USER |
| TPASS 入口導向 TPASS 設定頁 | 5:2 | web `SettingsPage.tsx:55` → `navigate('/settings/tpass')` / app `settings/index.tsx:39` → `router.push('/settings/tpass')` | 是 | PENDING USER |
| 已同步狀態 badge（blue「已同步」） | 5:2 | web `SettingsPage.tsx:19,54`（`tpassBound` ← `useTpassStatus().bound`）/ app `settings/index.tsx:16,38` | 是 | PENDING USER |

備註：兩端皆以 `useTpassStatus()` 的 `bound` 旗標決定是否顯示已同步 badge，資料來源與 web 一致。

---

## 2. TPASS 設定頁 — frames 5:138 / 5:25 / 5:153 / 5:164

Web `frontend/src/pages/TpassSettingsPage.tsx`；APP `app/app/settings/tpass.tsx`。

| State | Figma frame | Implementation (web / app) | Code-verified? | Live sign-off |
|---|---|---|---|---|
| Empty（未綁定，輸入身分證/出生日表單） | 5:138 | web `TpassSettingsPage.tsx:55-56,98-163`（`EmptyCredentialForm`，`status.bound` 為 false 時渲染）/ app `tpass.tsx:53-54,61-110` | 是 | PENDING USER |
| Configured / happy（已設定身分資料 + 卡片列表） | 5:25 | web `TpassSettingsPage.tsx:45-54`（`ConfiguredView` + `CardList`）`165-344` / app `tpass.tsx:48-52,127-279` | 是 | PENDING USER |
| Loading（status 載入中） | 5:153 | web `TpassSettingsPage.tsx:41-44`（`status === undefined` → 載入中）；同步中按鈕 disabled `217-228`（`syncDisabled`）/ app `tpass.tsx:41-47`；同步按鈕 `loading=syncDisabled` `tpass.tsx:172` | 是 | PENDING USER |
| Error-unexpected（同步未預期錯誤） | 5:164 | web `TpassSettingsPage.tsx:30-32,188-191,208-212`（`hasError` 判 `failed/partial_failed` + `sync_error`，顯示「同步異常」badge 與錯誤文案）/ app `tpass.tsx:30-32,154-155,164-168` | 是 | PENDING USER |

備註：
- 同步中防重複觸發：web `syncDisabled = syncing || syncTpass.isPending`（`TpassSettingsPage.tsx:177`），app 同（`tpass.tsx:138`）→ 符合 spec「Loading 不允許重複觸發同步」。
- 解除設定確認：web 自訂 modal（`TpassSettingsPage.tsx:59-93`），app 用 `Alert.alert`（`tpass.tsx:141-146`）；兩者均提示「已同步卡片不受影響」。

---

## 3. 卡片詳情頁（happy）— frame 5:65

Web `frontend/src/pages/TpassCardDetailPage.tsx`；APP `app/app/settings/tpass/[id].tsx`。

| State / 元素 | Figma frame | Implementation (web / app) | Code-verified? | Live sign-off |
|---|---|---|---|---|
| 完整卡號（僅詳情頁顯示） | 5:65 | web `TpassCardDetailPage.tsx:115`（`card.card_number`）/ app `[id].tsx:123` | 是 | PENDING USER |
| 關聯帳戶選擇器（僅 CREDIT 帳戶可選、可解除） | 5:65 | web `TpassCardDetailPage.tsx:134,166-215`（`LinkedAccountSelector`，`type === 'CREDIT'` 過濾、`allowClear`，409 衝突文案）/ app `[id].tsx:131,162-209` | 是 | PENDING USER |
| 官方月彙總表（次數/金額/回饋逐運具） | 5:65 | web `TpassCardDetailPage.tsx:217-268`（`MonthlySummaryCard` + `MonthlyRewardTable`，5 運具列）/ app `[id].tsx:211-279` | 是 | PENDING USER |
| 外部連結 + 免責文案 | 5:65 | web `TpassCardDetailPage.tsx:151-161`（官方 URL `:16` + 免責「官方快照僅提供月彙總」）/ app `[id].tsx:153-156`（`Linking.openURL` + 同文案，URL `:18`） | 是 | PENDING USER |
| 載入 / 錯誤 / 無彙總 | 5:65 | web `TpassCardDetailPage.tsx:70-92,138-148` / app `[id].tsx:84-98,135-150` | 是 | PENDING USER |

備註：官方 URL 兩端一致 `https://promohub.easycard.com.tw/promohub/applyfbs!query.action`，與後端爬蟲使用網址相同。

---

## 4. 信用卡帳戶 TPASS 區塊 — frame 5:117（含第二驗收條件重點）

Web `frontend/src/pages/AccountDetailPage.tsx`；APP `app/app/accounts/[id].tsx`。

| 設計要求（第二驗收條件） | Figma frame | Implementation (web / app) | Code-verified? | Live sign-off |
|---|---|---|---|---|
| **單張卡**（非清單） | 5:117 | web `AccountDetailPage.tsx:641-648`（`TpassSection` 取 `data.card` 單一物件，`648` `const card = data.card`）/ app `[id].tsx:717-723` | 是 | PENDING USER |
| 上月/本月進度（逐運具 prev/curr 次數） | 5:117 | web `AccountDetailPage.tsx:652-671,719-734`（rows：short_bus / intercity_bus / 軌道加碼，`上月 N 次` `727` + `本月 N 次` `728`）/ app `[id].tsx:729-748,783-792` | 是 | PENDING USER |
| **上月官方回饋金額** | 5:117 | web `AccountDetailPage.tsx:697-701`（`上月回饋` `$previous_month_reward_amount` + badge「官方核定」）/ app `[id].tsx:765-769` | 是 | PENDING USER |
| **本月預估回饋金額** | 5:117 | web `AccountDetailPage.tsx:703-709`（`本月預估` `$current_month_estimated_reward_amount` + badge「差 N 次」）/ app `[id].tsx:771-777` | 是 | PENDING USER |
| 距下一級距剩餘次數提示 | 5:117 | web `AccountDetailPage.tsx:673-674,737-740`（`remaining_ride_count_to_next_threshold`）/ app `[id].tsx:726-727,794-797` | 是 | PENDING USER |
| **不混入交易列表**（獨立卡片） | 5:117 | web `AccountDetailPage.tsx:491-492`（TPASS 區塊在交易列表外、緊接於 `account.type === 'CREDIT'` 條件後獨立渲染）/ app `[id].tsx:577-578` | 是 | PENDING USER |
| 非 CREDIT / 無關聯卡片時隱藏 | 5:117 | web `AccountDetailPage.tsx:492`（`account.type === 'CREDIT' && <TpassSection/>`）+ `646`（`if (!data?.card) return null`）/ app `[id].tsx:578`（`isCredit && <TpassSection/>`）+ `721`（`if (!data?.card) return null`） | 是 | PENDING USER |

**第二驗收條件（code-level）結論：** 兩端信用卡帳戶 TPASS 區塊均為**單張卡**（`data.card` 單一物件，非陣列/map）、顯示**上月與本月進度**（逐運具 prev/curr 次數 + 文字進度提示）、並同時呈現**上月官方核定回饋**（`previous_month_reward_amount`）與**本月預估回饋**（`current_month_estimated_reward_amount`），與 frame 5:117 設計一致。對照 file:line 已如上表逐項列出。

---

## 5. Disabled / read-only（5:175）與 Unauthenticated（5:187）

| State | Figma frame | 處理方式 | Code-verified? | Live sign-off |
|---|---|---|---|---|
| Disabled / read-only（當月資料未開放或不可同步、完整卡號唯讀） | 5:175 | 以既有狀態組合涵蓋：同步中時同步按鈕 disabled（web `TpassSettingsPage.tsx:217-228` / app `tpass.tsx:172`）；完整卡號唯讀顯示於卡片詳情（web `TpassCardDetailPage.tsx:115` / app `[id].tsx:123`，純文字非可編輯）。**未**為 5:175 製作專屬 disabled 文案區塊。 | 部分（無專屬區塊） | PENDING USER（須產品確認 5:175 是否需獨立畫面） |
| Unauthenticated（未登入無法保存身分/同步/關聯） | 5:187 | 由全域路由守衛處理：TPASS routes 註冊於受保護群組，未登入會被導向登入頁（後端 JWTAuth middleware；前端 auth store 導頁，參見 `SettingsPage.tsx:14-17` 登出導向 `/login`）。TPASS 頁本身**未**渲染專屬 5:187 未登入畫面，因為登入前不會到達此頁。 | 部分（靠路由守衛，無頁內 unauth state） | PENDING USER |

備註：5:175 與 5:187 在 spec（`designs/figma.md:53-54`）列為 acceptance，但實作以「狀態組合 + 路由守衛」涵蓋而非獨立畫面。是否補做專屬畫面需於 verification 階段與產品確認；此處誠實標記為 partial。

---

## 6. 已知設計打磨延後項（沿用 tasks.md，供 verification 階段參考）

以下為 tasks.md 已登記、雙 reviewer 判為非阻塞的延後項，verification 階段應一併檢視：

1. **5.5 門檻進度條未渲染**（`tasks.md:156`）：frame 5:117 的門檻進度條目前以「逐列 hint + 文字進度提示」表達，未繪製進度條 UI 元件。
2. **「差 0 次」措辭**（`tasks.md:156`）：`remaining = 0` 時顯示「差 0 次」，設計可改為「已達標」。（web `AccountDetailPage.tsx:707` / app `[id].tsx:775`）
3. **4.2 `RemainingRideCountToNextThreshold` 公式待產品確認**（`tasks.md:113`）：目前採 short-bus headline tier（<11→11、11..30→31、≥31→0），spec 未釘死單一公式，前端指標日後可能改追蹤其他級距。
4. **2.x scraper 逐卡明細限制**（`tasks.md:84`）：`tpass.Scraper.Query` 目前回傳未以卡號為鍵的扁平摘要，多明細卡記為 partial_failed；逐卡明細抓取待 scraper 擴充。

---

## 7. shared 套件測試覆蓋（task 6.4 PART 1）

- 檔案：`packages/shared/src/hooks/__tests__/useTpass.test.ts`
- **Hooks 型別覆蓋**：export 測試（所有 9 個 TPASS hooks 皆為 function）+ `tsc --noEmit` typecheck 通過。
- **Query invalidation 覆蓋**：採 FALLBACK 取向（非 renderHook）。`@zenbill/shared` 套件無 DOM 測試基礎建設（無 react-dom 依賴、無 jsdom/happy-dom、無 @testing-library/react；devDeps 僅 vitest + typescript），且這些套件不在 pnpm store 內、加入需網路與額外 vitest DOM 設定，對此 leaf 套件不成比例。改以**真實 `@tanstack/react-query` QueryClient** 驗證：(a) 明確宣告每個 mutation 的完整 invalidation key 集合並透過 spy 斷言；(b) 種入真實 query 至 cache，斷言 `['tpass']`（sync）與 `['accounts']`（sync/link）確實以 react-query 的 prefix matching 命中相關 query、且不誤傷無關 query。
- 結果：`pnpm --filter @zenbill/shared typecheck` ✅；`pnpm --filter @zenbill/shared test` ✅（檔案內 10 tests，全套件 37 tests 全綠）。

---

## 8. Live runtime 手動驗證：PENDING USER

以下步驟需由使用者在真機 APP 與瀏覽器（接真實後端）執行並簽核：

1. **設定入口**：開啟「設定」→ 確認三項入口（電子發票 / TPASS 2.0 悠遊卡 / 幣別）→ 點 TPASS 入口進入 TPASS 設定頁（frame 5:2）。
2. **設定身分資料**：未綁定時輸入身分證字號 + 出生年月日 → 「儲存並同步」（frame 5:138 → 觸發同步）。
3. **同步狀態**：觀察同步中（按鈕 disabled、不可重複觸發，frame 5:153）→ 完成後顯示「已同步」與最後同步時間（frame 5:25）；若失敗確認「同步異常」文案（frame 5:164）。
4. **卡片詳情**：於卡片列表點入 → 確認完整卡號、官方月彙總表、外部連結 + 免責文案（frame 5:65）。
5. **關聯帳戶**：在卡片詳情選擇信用卡帳戶關聯 → 重複關聯同帳戶應出現 409 衝突文案 → 可解除關聯。
6. **信用卡帳戶 TPASS 區塊**：開啟已關聯的信用卡帳戶詳情 → 確認單張卡、上月/本月逐運具進度、上月官方回饋 + 本月預估回饋、剩餘次數提示，且區塊與交易列表分離（frame 5:117）；於非 CREDIT 或無關聯卡片帳戶確認區塊隱藏。
7. **Disabled / Unauthenticated**：確認未登入導向登入頁（5:187 行為）；與產品確認 5:175 是否需專屬畫面。
8. **跨平台**：以上步驟在 Web（`frontend/`）與 APP（`app/`）兩端各跑一次。

簽核欄：

- [ ] Web live 驗證通過（簽核人 / 日期）
- [ ] APP live 驗證通過（簽核人 / 日期）
