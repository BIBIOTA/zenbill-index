# ZenBill Project Context

## 1. Project Overview (專案概觀)
**Name:** ZenBill
**Description:** 一個以開發者為導向的自動化記帳系統。
**Core Value:**
1. **自動化發票同步:** 串接財政部電子發票 API (手機條碼/載具)。
2. **規則引擎 (Rule Engine):** 使用 Regex 與關鍵字自動清洗商家名稱 (Normalization)。
3. **資產生命週期:** 模擬信用卡自動扣款 (Auto-pay) 與複式簿記 (Double-Entry)。
**Stack:** Go (Golang) 1.22+, PostgreSQL 16, Docker, Gin, GORM, Viper, PlantUML.

## 2. Key Documentation Map (文件索引)
Refer to these files for the source of truth:

### Product & System Logic (`docs/phase-1/`)
*此目錄包含核心邏輯與使用者需求 (Traditional Chinese)*
- **User Stories:** `docs/phase-1/1.user-story.md` (功能需求與驗收標準)
- **Specs (PRD):** `docs/phase-1/2.spec.md` (詳細規格)
- **Flow:** `docs/phase-1/3.system-flow.puml` (系統時序圖)

### Backend Implementation (`backend/phase-1/`)
*此目錄包含技術實作細節*
- **Tech Spec:** `backend/phase-1/1.technical-architecture.md` (架構設計)
- **DB Schema:** `backend/phase-1/2.database-schema.puml` (ER Diagram)
- **Code Arch:** `backend/phase-1/3.backend-architecture.puml` (程式分層)
- **Tasks:** `backend/phase-1/4.todo-list.md` (開發待辦)
- **Tests:** `backend/phase-1/5.test-cases.md` (測試案例)

## 3. Common Commands

### Development
- **Run API Server:** `go run cmd/api/main.go`
- **Run Worker:** `go run cmd/worker/main.go`
- **Tidy Modules:** `go mod tidy`
- **Linting:** `golangci-lint run`

### Infrastructure (Docker)
- **Start DB:** `docker-compose up -d db pgadmin`
- **Stop All:** `docker-compose down`

### Testing
- **Run Unit Tests:** `go test ./internal/usecase/... -v`
- **Run Integration Tests:** `APP_ENV=test go test ./internal/repository/... -v`
- **Run All Tests:** `go test ./...`

## 4. Coding Guidelines (開發規範)

### Go Style
- **Error Handling:** 必須顯式處理錯誤，商業邏輯層禁止使用 `panic`。
- **Naming:**
  - Exported: `PascalCase`
  - Internal: `camelCase`
  - Interfaces: 使用行為命名 (e.g., `InvoiceRepository`, `Normalizer`).
- **Configuration:** 使用 `viper` 讀取環境變數 (`ZENBILL_` prefix).

### Architecture (Clean Architecture)
- **`cmd/`**: 程式入口，僅負責依賴注入 (DI)。
- **`internal/delivery/http`**: 僅負責解析 Request 與回傳 JSON，不包含商業邏輯。
- **`internal/usecase`**: 核心商業邏輯 (Rule Engine, Ledger Calculation)。
- **`internal/domain`**: 純淨的 Entities 與 Interface 定義 (禁止 import GORM)。
- **`internal/repository`**: 資料庫實作層 (GORM)。

### Database Strategy
- **Transactions:** 涉及 `transactions` 表寫入與 `accounts` 餘額更新時，務必使用 DB Transaction (ACID)。
- **Raw Data:** API 回傳的原始明細存入 `JSONB` (e.g., `invoices.raw_details`)。

## 5. Naming Conventions
- **Project:** ZenBill
- **Go Module:** `github.com/your-username/zenbill`
- **Database:** `zenbill_db`
- **Env Prefix:** `ZENBILL_`

## 6. Development Workflow (MANDATORY SOP)

⚠️ **CRITICAL: This section defines the MANDATORY Standard Operating Procedure for all feature development.**

When the user requests feature development using phrases like:
- "Start feature [X]"
- "Implement [X]"
- "Build [X] functionality"
- "開始開發 [X]"
- "實作 [X] 功能"

You **MUST** follow this **4-Phase Development Cycle**. This is not optional.

### 🎯 The 4-Phase Cycle

```
Phase 1: Context & Design  → 理解需求與設計
Phase 2: Implementation    → 高品質實作
Phase 3: Verification      → 嚴格測試
Phase 4: Closure           → 文件同步與收尾
```

---

### 📖 Phase 1: Context & Design (理解與設計)

**MUST DO:**
1. **Read Product Specifications**
   - Use `consult-spec` skill OR
   - Read `docs/phase-1/1.user-story.md` and `docs/phase-1/2.spec.md`
   - Find relevant sections for this feature

2. **Read Technical Design**
   - Use `schema-inspector` skill OR
   - Read `backend/phase-1/1.technical-architecture.md` and `backend/phase-1/2.database-schema.puml`
   - Understand which tables/entities are involved

3. **Create Implementation Plan**
   - Summarize requirements
   - List files to be modified/created
   - Explain implementation strategy
   - **GET USER CONFIRMATION** before proceeding to Phase 2

**Checkpoint:**
- ✅ Specifications reviewed
- ✅ Schema/Architecture understood
- ✅ Plan created and confirmed by user

**Tools:**
- `context-loader` skill (快速載入所有文件)
- `consult-spec` skill (查詢特定規格)
- `schema-inspector` skill (查看 DB Schema)

---

### 💻 Phase 2: Implementation (程式實作)

**MUST DO:**
1. **Follow Clean Architecture**
   - Domain Layer (`internal/domain/`) - Pure entities & interfaces
   - Repository Layer (`internal/repository/`) - Database operations with GORM
   - Usecase Layer (`internal/usecase/`) - Business logic
   - Delivery Layer (`internal/delivery/http/`) - HTTP handlers

2. **Use Code Generation Tools When Appropriate**
   - New entity? → Use `scaffold-domain` skill
   - Regex rule? → **MUST** use `regex-tester` skill to validate BEFORE adding to code

3. **Continuous Quality Check**
   - Run `lint-check` skill after writing each module
   - Ensure code compiles: `go build ./...`

**Checkpoint:**
- ✅ Code follows Clean Architecture
- ✅ Code passes `lint-check`
- ✅ Code compiles successfully

**Tools:**
- `scaffold-domain` skill (產生 Domain Layer 模板)
- `regex-tester` skill (驗證 Regex Pattern - **ZenBill 核心功能**)
- `lint-check` skill (程式碼品質檢查)

---

### 🧪 Phase 3: Verification (測試驗證)

**MUST DO:**
1. **Read Test Specifications**
   - Read `backend/phase-1/5.test-cases.md`
   - Identify relevant test scenarios

2. **Write Tests**
   - Unit tests (`*_test.go` in usecase/)
   - Integration tests (`*_test.go` in repository/, if DB involved)
   - Cover both success and error cases

3. **Execute Tests**
   ```bash
   go test ./... -v
   ```

4. **Handle Test Failures**
   - ⚠️ **CRITICAL:** If ANY test fails, you **MUST STOP** and fix the code
   - **DO NOT** skip failed tests
   - **DO NOT** mark feature as complete with failing tests
   - Fix → Re-run → Pass → Continue

**Checkpoint:**
- ✅ Unit tests written
- ✅ Integration tests written (if applicable)
- ✅ **ALL TESTS PASS** (non-negotiable)
- ✅ Test coverage includes main logic branches

**Tools:**
- `verify-and-close` skill (自動執行完整驗證流程)

---

### 📝 Phase 4: Closure (文件與收尾)

**MUST DO:**
1. **Update Progress**
   - Use `check-progress` skill OR
   - Edit `backend/phase-1/4.todo-list.md`
   - Mark completed task as `[x]`

2. **Sync Documentation** (if applicable)
   - **Database changes?** → Update `backend/phase-1/2.database-schema.puml`
   - **API changes?** → Update `docs/phase-1/2.spec.md`
   - **Architecture changes?** → Update `backend/phase-1/1.technical-architecture.md`

3. **Completion Report**
   - List what was completed
   - List files modified
   - Report test results
   - Suggest next steps

**Checkpoint:**
- ✅ TODO list updated
- ✅ Documentation synced (if changed)
- ✅ Completion reported to user

**Tools:**
- `check-progress` skill (檢查並更新進度)
- `verify-and-close` skill (完整的驗證與收尾)

---

### 🚀 Recommended Workflow

**Use Composite Skills for Maximum Efficiency:**

```bash
# Option 1: Manual step-by-step
Phase 1: Use `context-loader` + `consult-spec` + `schema-inspector`
Phase 2: Write code + Use `lint-check`
Phase 3-4: Use `verify-and-close` (handles both phases automatically)

# Option 2: Guided workflow (RECOMMENDED)
Use `start-feature` skill → It will guide you through all 4 phases automatically
```

**The `start-feature` skill is your workflow orchestrator** - it ensures all phases are executed correctly.

---

### ⛔ Absolute Rules (Non-Negotiable)

1. **DO NOT skip Phase 1** - Always read specifications before coding
2. **DO NOT skip Phase 3** - All code must have tests
3. **DO NOT ignore test failures** - Failed tests = feature not complete
4. **DO NOT forget Phase 4** - Always update TODO and sync docs
5. **DO NOT use Regex without validation** - Always use `regex-tester` for Rule Engine patterns

### ✅ Success Criteria

A feature is considered "complete" ONLY when:
- ✅ Aligns with specifications (Phase 1)
- ✅ Passes lint check (Phase 2)
- ✅ Compiles successfully (Phase 2)
- ✅ All tests pass (Phase 3)
- ✅ TODO updated (Phase 4)
- ✅ Documentation synced (Phase 4)

---

## 7. Claude Code Skills (AI-Assisted Development)

ZenBill 配備了 **Role-Based Skills**，讓 Claude 能自動判斷何時使用專業工具來確保開發品質。

### Skills 位置
所有 Skills 位於：`.claude/skills/`

### Skills 架構層次

ZenBill 的 Skills 採用三層架構：

```
Layer 3: Workflow Orchestration (流程編排)
├── start-feature       ← 完整 4-Phase 開發流程
├── verify-and-close    ← Phase 3-4 自動化
└── context-loader      ← 快速載入所有文件

Layer 2: Atomic Skills (原子性工具)
├── consult-spec        ← 查詢規格
├── check-progress      ← 檢查進度
├── lint-check          ← 程式碼檢查
├── schema-inspector    ← Schema 檢查
├── regex-tester        ← Regex 驗證
└── scaffold-domain     ← 程式碼產生
```

### Skills 自動觸發機制
**你不需要手動呼叫這些工具**。Claude 會根據情境自動判斷何時使用：
- 當你說「Start feature X」→ 自動使用 `start-feature` 執行完整 4-Phase 流程
- 當你問「接下來要做什麼？」→ 自動使用 `check-progress`
- 當你說「幫我寫一個規則抓 7-11」→ 自動使用 `regex-tester` 驗證
- 當你要建立新 Entity → 自動使用 `schema-inspector` 檢查 Schema
- 當你完成功能開發 → 自動使用 `verify-and-close` 確保品質

---

### 🎯 Layer 3: Workflow Orchestration (複合型流程)

#### `start-feature` - 完整開發流程 ⭐ **推薦使用**
- **用途：** 執行完整的 4-Phase 開發循環（Context → Implementation → Verification → Closure）
- **觸發關鍵字：** "Start feature X", "實作 X 功能", "開始開發 X"
- **自動呼叫：** `context-loader`, `consult-spec`, `schema-inspector`, `lint-check`, `verify-and-close`
- **手動執行：** `.claude/skills/start-feature/scripts/prepare.sh "功能名稱"`
- **重要性：** 這是 ZenBill 開發流程的總指揮，確保不會遺漏任何步驟

#### `verify-and-close` - 驗證與收尾
- **用途：** 自動執行 Phase 3 (測試) 和 Phase 4 (收尾)
- **觸發時機：** 功能開發完成後
- **包含流程：**
  1. Lint check (`golangci-lint`)
  2. Build check (`go build`)
  3. Test execution (`go test`)
  4. TODO 更新
  5. 文件同步檢查
- **手動執行：** `.claude/skills/verify-and-close/scripts/verify.sh`
- **強制規則：** 測試失敗必須停止，不允許標記完成

#### `context-loader` - 快速情境載入
- **用途：** 一次性載入所有專案文件（規格、架構、Schema、TODO）
- **觸發時機：** 開始新功能、onboarding、長時間離開專案後
- **載入內容：**
  - Product: User Stories, Specs
  - Technical: Architecture, Schema, TODO, Test Cases
  - Project: CLAUDE.md
- **手動執行：**
  - 完整模式：`.claude/skills/context-loader/scripts/load.sh`
  - 摘要模式：`.claude/skills/context-loader/scripts/load.sh --summary`

---

### 👔 Layer 2: PM Role (Product Manager)

#### `consult-spec` - 查詢規格書
- **用途：** 確保開發符合 `docs/phase-1/` 的設計文件
- **觸發時機：** 開發前確認需求、查詢 User Story、Spec
- **手動執行：** `.claude/skills/consult-spec/scripts/search.sh "關鍵字"`

#### `check-progress` - 檢查進度
- **用途：** 查看 Phase-1 待辦事項與完成進度
- **觸發時機：** 「我們現在到哪了？」、「接下來要做什麼？」
- **手動執行：** `.claude/skills/check-progress/scripts/check.sh`

### 🔍 Reviewer Role (Architecture/QA)

#### `lint-check` - 程式碼品質檢查
- **用途：** 執行 `golangci-lint` 確保程式碼符合規範
- **觸發時機：** 提交前、完成功能後、重構後
- **手動執行：** `.claude/skills/lint-check/scripts/lint.sh`
- **必備工具：** `golangci-lint` (需先安裝)

#### `schema-inspector` - 資料庫 Schema 檢查
- **用途：** 查看 `backend/phase-1/2.database-schema.puml`
- **觸發時機：** 建立 Entity、實作 Repository、修改欄位
- **手動執行：** `.claude/skills/schema-inspector/scripts/inspect.sh [table_name]`

### 💻 Coder Role (Developer)

#### `regex-tester` - Regex 測試器 ⭐ **核心工具**
- **用途：** 測試 Rule Engine 的 Regex Pattern 是否正確匹配商家名稱
- **重要性：** ZenBill 最核心的功能！在寫入 `rule_engine.go` 前必須驗證
- **觸發時機：** 建立/修改商家正規化規則
- **手動執行：**
  ```bash
  go run .claude/skills/regex-tester/scripts/tester.go "^7-11.*" "7-11 Dunhua Store"
  ```
- **範例：**
  ```bash
  # 測試 Uber Eats（忽略大小寫）
  go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\\s*eats" "UBER EATS - Food"
  ```

#### `scaffold-domain` - Domain Layer 產生器
- **用途：** 自動產生 Clean Architecture 的 Entity 與 Repository 模板
- **觸發時機：** 建立新的業務實體（如 Payment, Subscription）
- **手動執行：** `.claude/skills/scaffold-domain/scripts/scaffold.sh EntityName`
- **產生檔案：**
  - `internal/domain/<entity>.go`
  - `internal/repository/<entity>_repository.go`

### 🎯 Vibe Coding 工作流程範例

**情境：實作商家正規化規則**

1. **User:** "我們接下來要做什麼？"
   - **Claude:** [自動使用 `check-progress`] "根據 TODO，下一步是實作 Rule Engine..."

2. **User:** "好，先查一下規格書關於 Rule Engine 的設計"
   - **Claude:** [自動使用 `consult-spec`] "根據 docs/phase-1/2.spec.md:78，Rule Engine 使用 Regex..."

3. **User:** "幫我寫一個規則來抓全家便利商店"
   - **Claude:** [自動使用 `regex-tester` 驗證] "我測試過了，這個 Pattern 可以準確匹配..."

4. **User:** "好，建立 Merchant entity"
   - **Claude:** [自動使用 `schema-inspector` 查 Schema → 使用 `scaffold-domain` 產生模板] "已建立檔案..."

5. **User:** "檢查一下程式碼"
   - **Claude:** [自動使用 `lint-check`] "Lint 通過，沒有問題！"

### 💡 最佳實踐

1. **信任自動化：** Claude 會在適當時機自動使用這些工具，你只需專注在業務需求
2. **關鍵驗證點：**
   - Regex 規則 → **必須**先用 `regex-tester` 驗證
   - 新增 Entity → **必須**先用 `schema-inspector` 查 Schema
   - 提交程式碼 → **必須**通過 `lint-check`
3. **手動執行：** 如果你想手動測試，可以直接執行上述腳本

### 📚 延伸閱讀
- 各 Skill 的詳細說明：查看 `.claude/skills/*/SKILL.md`
- Clean Architecture 規範：`backend/phase-1/1.technical-architecture.md`
- Coding Guidelines：本文件第 4 節
