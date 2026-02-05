---
name: start-feature
description: 啟動完整的功能開發流程。當用戶說「Start feature X」、「實作 X 功能」、「開始開發 X」時使用。這是 ZenBill RD Vibe Coding 的標準作業程序入口。
---

# Start Feature (啟動功能開發)

## 🎯 角色定位
**Workflow Orchestrator** - 完整開發流程的總指揮

## 重要性
這是 **ZenBill 開發流程的核心 Skill**！

當用戶要求開發新功能時，此 Skill 會自動執行完整的 4-Phase 開發循環，確保：
1. ✅ 不會遺漏規格文件
2. ✅ 不會忘記查看 Schema
3. ✅ 不會跳過測試
4. ✅ 不會忘記更新文件

## 觸發關鍵字
- "Start feature [功能名稱]"
- "實作 [功能名稱]"
- "開始開發 [功能名稱]"
- "Implement [功能名稱]"
- "Build [功能名稱]"

## 強制執行的 4-Phase 流程

### 📖 Phase 1: Context & Design (理解與設計)

**目標：** 確保完全理解需求和技術架構

**必須執行：**
1. **讀取產品規格**
   - 使用 `consult-spec` 或直接讀取：
     - `docs/phase-1/1.user-story.md` - User Story 與驗收標準
     - `docs/phase-1/2.spec.md` - 詳細規格說明
   - 找出與此功能相關的章節

2. **讀取技術設計**
   - 使用 `schema-inspector` 或直接讀取：
     - `docs/backend/1.technical-architecture.md` - 架構設計
     - `docs/backend/2.database-schema.puml` - 資料庫 Schema
   - 確認涉及哪些資料表和欄位

3. **制定實作計畫**
   - 總結需求理解
   - 列出需要修改的檔案
   - 說明實作策略
   - **向用戶確認計畫** 再進入下一階段

**檢查點：**
- ✅ 已讀取相關規格文件
- ✅ 已查看資料庫 Schema
- ✅ 已向用戶說明實作計畫並獲得確認

---

### 💻 Phase 2: Implementation (程式實作)

**目標：** 按照 Clean Architecture 開發高品質程式碼

**必須執行：**
1. **遵循架構分層**
   - Domain Layer (`internal/domain/`) - 定義 Entity 與 Interface
   - Repository Layer (`internal/repository/`) - 資料庫操作
   - Usecase Layer (`internal/usecase/`) - 業務邏輯
   - Delivery Layer (`internal/delivery/http/`) - API Handler

2. **使用輔助工具**
   - 如需建立新 Entity → 使用 `scaffold-domain`
   - 如需建立 Regex 規則 → 使用 `regex-tester` 驗證

3. **即時品質檢查**
   - 寫完每個模組後立即使用 `lint-check`
   - 確保程式碼能編譯：`go build ./...`

**檢查點：**
- ✅ 程式碼符合 Clean Architecture
- ✅ 通過 `lint-check`
- ✅ 程式碼可以成功編譯

---

### 🧪 Phase 3: Verification (測試驗證)

**目標：** 確保功能正確且不破壞現有系統

**必須執行：**
1. **讀取測試規格**
   - 讀取 `docs/backend/5.test-cases.md`
   - 找出與此功能相關的測試場景

2. **撰寫測試**
   - Unit Tests (`*_test.go` in usecase/)
   - Integration Tests (`*_test.go` in repository/)
   - 涵蓋正常流程與錯誤處理

3. **執行測試**
   ```bash
   go test ./... -v
   ```

4. **測試失敗處理**
   - ⚠️ **CRITICAL:** 如果測試失敗，**必須停止並修正程式碼**
   - 不允許跳過失敗的測試
   - 修正後重新執行測試直到通過

**檢查點：**
- ✅ 已撰寫單元測試
- ✅ 已撰寫整合測試（如涉及資料庫）
- ✅ 所有測試通過 (PASS)
- ✅ 測試覆蓋主要邏輯分支

---

### 📝 Phase 4: Documentation & Closure (文件與收尾)

**目標：** 確保專案進度與文件同步

**必須執行：**
1. **更新進度**
   - 使用 `check-progress` 或直接編輯
   - 在 `docs/backend/4.todo-list.md` 標記任務為 `[x]`

2. **同步文件**（視情況）
   - **如果修改了資料庫結構** → 必須更新 `2.database-schema.puml`
   - **如果修改了 API 介面** → 必須更新 `2.spec.md`
   - **如果實作方式與原設計不同** → 必須更新 `1.technical-architecture.md`

3. **總結報告**
   - 列出完成的項目
   - 列出修改的檔案
   - 說明測試結果
   - 提示是否需要進行下一個功能

**檢查點：**
- ✅ TODO List 已更新
- ✅ 相關文件已同步（如有變更）
- ✅ 向用戶報告完成狀態

---

## 完整流程範例

### 用戶輸入
```
User: Start feature "信用卡自動扣款"
```

### Claude 執行流程

#### Phase 1: Context & Design
```
Claude: 收到！我將啟動 ZenBill 標準開發流程。

📖 Phase 1: Context & Design
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ 正在讀取產品規格...
[使用 consult-spec 搜尋 "自動扣款"]

✅ 已讀取：docs/phase-1/2.spec.md:125-180
   規格摘要：
   - 自動扣款在繳費期限前 3 天觸發
   - 從信用卡帳戶扣款到應付帳款
   - 使用複式簿記記錄

2️⃣ 正在查看資料庫設計...
[使用 schema-inspector 查詢 accounts, transactions]

✅ 已確認 Schema：
   - accounts 表有 balance 欄位
   - transactions 表用於記錄扣款
   - ledger_entries 表用於複式簿記

3️⃣ 實作計畫：
   □ 在 internal/usecase/ 建立 auto_pay_usecase.go
   □ 實作 ProcessAutoPay() 方法
   □ 整合 LedgerCalculator 進行複式簿記
   □ 新增排程邏輯（Worker）

請確認此計畫是否正確？
```

#### Phase 2: Implementation
```
User: 確認，開始吧

Claude:
💻 Phase 2: Implementation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[開始寫程式...]

✅ 已建立：internal/usecase/auto_pay_usecase.go
✅ 已建立：internal/usecase/auto_pay_usecase_test.go

正在執行 lint-check...
✅ Lint 通過

程式碼實作完成，進入測試階段。
```

#### Phase 3: Verification
```
Claude:
🧪 Phase 3: Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ 已讀取測試規格：docs/backend/5.test-cases.md
   相關測試場景：
   - TC-AutoPay-001: 正常扣款流程
   - TC-AutoPay-002: 餘額不足處理
   - TC-AutoPay-003: 複式簿記正確性

2️⃣ 已撰寫測試用例

3️⃣ 執行測試...
   go test ./internal/usecase/... -v

✅ PASS: TestAutoPayUsecase_Success
✅ PASS: TestAutoPayUsecase_InsufficientBalance
✅ PASS: TestAutoPayUsecase_DoubleEntryValidation

所有測試通過！進入收尾階段。
```

#### Phase 4: Closure
```
Claude:
📝 Phase 4: Documentation & Closure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 已更新 TODO: docs/backend/4.todo-list.md
   [x] 實作信用卡自動扣款功能

✅ 文件同步確認：
   - Schema 未變更，無需更新
   - API 未變更，無需更新

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 功能開發完成！

📊 總結：
   - 新增檔案：2 個
   - 測試通過：3/3
   - Lint 狀態：✅ PASS

🔜 下一步建議：
   - 可以開始實作「發票同步排程器」
   - 或進行整合測試

還有其他需求嗎？
```

---

## 與其他 Skills 的協作

此 Skill 會自動呼叫：
- `consult-spec` (Phase 1)
- `schema-inspector` (Phase 1)
- `scaffold-domain` (Phase 2, 視需要)
- `regex-tester` (Phase 2, 如涉及 Rule Engine)
- `lint-check` (Phase 2)
- `check-progress` (Phase 4)

## 快速執行腳本（可選）

如果你想手動觸發整個流程的輔助腳本：

```bash
.claude/skills/start-feature/scripts/prepare.sh "功能名稱"
```

此腳本會：
1. 顯示相關的規格文件片段
2. 顯示相關的 Schema 定義
3. 列出當前待辦事項
4. 提示你開始開發

## 注意事項

### ⚠️ 強制規則
- **不得跳過任何 Phase**
- **Phase 3 測試失敗必須停止並修正**
- **Phase 4 必須更新 TODO**

### ✅ 最佳實踐
- Phase 1 結束後先向用戶確認計畫
- Phase 2 開發過程中隨時用 lint-check
- Phase 3 測試要涵蓋錯誤情境
- Phase 4 如實回報所有變更

### 🚫 禁止行為
- 不要跳過讀取規格直接開始寫程式
- 不要忽略測試失敗
- 不要忘記更新 TODO
- 不要修改 Schema 後不更新文件

---

## 進階：自訂流程

如果你的功能比較簡單（如修改一個小 bug），可以簡化流程：

```
User: Start feature "修正發票金額顯示錯誤" --simple
```

Simple Mode 會跳過 Phase 1 的詳細規格讀取，直接進入開發。但 **Phase 3 測試仍然是強制的**。

---

## 總結

**`start-feature` 是 ZenBill 的開發流程守護者。**

它確保每個功能都經過：
1. 深思熟慮的設計（Phase 1）
2. 高品質的實作（Phase 2）
3. 嚴格的測試（Phase 3）
4. 完整的文件（Phase 4）

這就是 **RD Vibe Coding** 的精髓——你只需要說 "Start"，剩下的流程由 AI 確保品質！
