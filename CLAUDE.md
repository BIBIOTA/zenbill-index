# ZenBill 專案開發指南

## 1. 專案概觀

**專案名稱:** ZenBill
**專案描述:** 一個以開發者為導向的自動化記帳系統。
**核心價值:**
1. **自動化發票同步:** 透過網頁爬蟲自動抓取財政部電子發票平台資料（手機條碼/載具）。
2. **規則引擎 (Rule Engine):** 使用 Regex 與關鍵字自動清洗商家名稱 (Normalization)。
3. **資產生命週期:** 模擬信用卡自動扣款 (Auto-pay) 與複式簿記 (Double-Entry)。
**技術棧:** Go (Golang) 1.22+, PostgreSQL 16, Docker, Gin, GORM, Viper, Playwright, PlantUML.

## 2. 專案架構

### 整體結構

ZenBill 採用 **Monorepo** 架構，文檔整合至根目錄。

```
zen-bill/                         ← 主 Git Repository (Monorepo)
├── README.md                     ← 📖 專案概覽與快速開始
├── SPEC.md                       ← 📋 產品與技術規格（整合文檔）
├── CLAUDE.md                     ← 🤖 本文件（AI 開發指南）
│
├── backend/                      ← 🔧 後端程式碼
│   ├── cmd/                      ← 程式入口點
│   │   ├── api/                  ← API Server
│   │   ├── worker/               ← 背景排程
│   │   ├── migrate/              ← 資料庫遷移
│   │   ├── manual_sync/          ← 手動同步（開發用）
│   │   └── captcha_trainer/      ← OCR 訓練工具
│   ├── internal/                 ← 內部程式碼（Clean Architecture）
│   │   ├── domain/               ← Domain Layer
│   │   ├── usecase/              ← Usecase Layer
│   │   ├── repository/           ← Repository Layer
│   │   ├── delivery/http/        ← HTTP Layer
│   │   └── config/               ← 配置管理
│   ├── pkg/                      ← 共享套件
│   │   ├── database/             ← 資料庫連線
│   │   ├── einvoice/             ← 發票爬蟲（Playwright + OCR）
│   │   ├── logger/               ← 日誌工具
│   │   └── metrics/              ← 效能指標
│   └── configs/                  ← 配置文件範例
│
└── .claude/skills/               ← 🤖 AI 輔助開發工具
```

### 目錄職責說明

#### 📖 文檔結構（2026-02-08 重組）

**核心文檔（根目錄）:**
- **`README.md`** - 專案概覽、快速開始、安裝指南
- **`SPEC.md`** - 產品規格、技術架構、測試案例（整合所有規格文件）
- **`CLAUDE.md`** - 本文件（AI 輔助開發指南）

**歷史文檔（已整合至 SPEC.md）:**
- ~~`docs/phase-1/`~~ - 產品需求已整合至 SPEC.md §1-2
- ~~`docs/backend/`~~ - 技術設計已整合至 SPEC.md §3-6
- ~~`docs/phase-2/`~~ - Phase 2 實作細節已整合至 SPEC.md §4
- ~~`docs/installation/`~~ - 安裝指南已整合至 README.md

#### 🔧 `backend/` - 後端程式碼（獨立 Git Repository）
**職責：** 純淨的程式碼目錄，遵循 Clean Architecture，只包含 `.go` 和 `_test.go` 檔案。

**重要：** `backend/` 是獨立的 Git Repository，擁有自己的 `.git/`、`go.mod`、配置文件。

**子目錄（Clean Architecture 分層）：**

1. **`backend/cmd/`** - 程式入口點
   - `cmd/api/` - API Server 入口
   - `cmd/worker/` - Worker 背景服務入口
   - `cmd/migrate/` - 資料庫遷移工具入口
   - **職責：** 依賴注入 (Dependency Injection)、啟動應用程式

2. **`backend/internal/`** - 內部程式碼（Clean Architecture）

   - **`internal/domain/`** - Domain Layer（領域層）
     - 純淨的實體 (Entities)
     - Repository 介面定義
     - 商業規則定義
     - **禁止：** import GORM 或任何框架

   - **`internal/usecase/`** - Usecase Layer（應用層）
     - 商業邏輯實作（規則引擎、帳本計算等）
     - 編排 Domain 與 Repository
     - **職責：** 核心業務流程

   - **`internal/repository/`** - Repository Layer（資料層）
     - 使用 GORM 的資料庫操作
     - 實作 Domain 定義的 Repository 介面
     - **職責：** 資料持久化

   - **`internal/delivery/`** - Delivery Layer（表現層）
     - `delivery/http/` - HTTP 處理器 (Gin handlers)
     - **職責：** 解析 Request、回傳 JSON，不包含商業邏輯

   - **`internal/config/`** - 配置管理
     - 使用 Viper 讀取環境變數
     - 配置結構定義

3. **`backend/pkg/`** - 後端共享套件
   - `pkg/database/` - 資料庫連線與工具
   - `pkg/einvoice/` - 電子發票爬蟲（Playwright）
   - **職責：** 可被多個模組重用的工具函式

4. **`backend/configs/`** - 配置範例
   - `config.yaml.example` - 配置檔範例

5. **專案配置文件：**
   - `go.mod`, `go.sum` - Go 依賴管理
   - `Makefile` - 構建與開發指令
   - `docker-compose.yml` - Docker 容器編排
   - `.golangci.yml` - Lint 規則配置
   - `.gitignore` - Git 忽略規則
   - `.env.example` - 環境變數範例

#### 📦 `pkg/` - 根層級共享套件
**職責：** 可被根目錄的多個子專案（backend/、未來的 frontend/）共享的通用套件。

**使用時機：** 當某個套件需要被多個獨立的 Git Repository 共享時。

**目前內容：**
- `pkg/database/` - 跨專案的資料庫工具
- `pkg/einvoice/` - 電子發票爬蟲（可能被多個服務使用）

#### 🚀 `cmd/` - 根層級程式入口
**職責：** 根層級的獨立工具程式或輔助腳本。

**範例：**
- `cmd/sandbox/` - 沙箱測試工具（OCR 訓練、爬蟲調試）
- `cmd/acceptance/` - 驗收測試工具
- `cmd/captcha_collector/` - 驗證碼收集工具

**特性：** 這些是開發過程中的輔助工具，不是主要應用程式。

#### 🤖 `.claude/skills/` - AI 輔助開發工具
**職責：** Claude Code 的自動化 Skills，提升開發效率。

**架構：** 採用三層架構（詳見第 8 節）
- Layer 3: 工作流程編排（start-feature, verify-and-close, context-loader）
- Layer 2: 原子性工具（consult-spec, check-progress, lint-check 等）

**特性：** 自動觸發，Claude 會根據情境判斷何時使用。

### 專案架構原則

1. **關注點分離 (Separation of Concerns)**
   - 文檔與程式碼分離：`docs/` vs `backend/`
   - 產品文檔與技術文檔分離：`docs/phase-1/` vs `docs/backend/`
   - 不同層級的程式碼分離：Clean Architecture

2. **單一職責原則 (Single Responsibility Principle)**
   - `backend/` 只包含程式碼和測試，不包含文檔
   - 每個 Layer 有明確的職責界限
   - 配置文件與程式碼分離

3. **依賴反轉原則 (Dependency Inversion Principle)**
   - `internal/domain/` 不依賴任何外部框架
   - `internal/repository/` 實作 Domain 定義的介面
   - 依賴方向：Delivery → Usecase → Domain ← Repository

4. **開放封閉原則 (Open-Closed Principle)**
   - 透過介面擴展功能，而非修改現有程式碼
   - Repository 介面定義在 Domain，實作在 Repository

### 開發時的導航指南

| 目的 | 查看位置 |
|------|---------|
| 了解產品需求 | `docs/phase-1/` |
| 了解技術設計 | `docs/backend/` |
| 查看開發進度 | `docs/backend/4.todo-list.md` |
| 實作業務邏輯 | `backend/internal/usecase/` |
| 定義資料結構 | `backend/internal/domain/` |
| 實作資料存取 | `backend/internal/repository/` |
| 實作 API 端點 | `backend/internal/delivery/http/` |
| 查看共享工具 | `backend/pkg/` 或 `pkg/` |
| 執行開發工具 | `cmd/` 或 `backend/cmd/` |
| 使用 AI 輔助 | `.claude/skills/` |

---

## 3. 文件索引（真理之源）

所有開發決策與需求以下列文件為準（2026-02-08 重組）：

### 核心文檔

| 文件 | 內容 | 用途 |
|------|------|------|
| **`README.md`** | 專案概覽、快速開始、環境建置 | 新手入門、環境設定 |
| **`SPEC.md`** | 產品規格、技術架構、測試案例、開發階段 | 功能開發、架構決策 |
| **`CLAUDE.md`** | AI 開發指南、Skills 說明、開發流程 | AI 輔助開發 |

### 重要章節索引（SPEC.md）

- **§1-2**: 產品願景與功能需求（原 `docs/phase-1/`）
- **§3**: 技術架構與 Clean Architecture（原 `docs/backend/1.technical-architecture.md`）
- **§4**: 發票爬蟲模組（原 `docs/phase-2/`）
- **§5**: 規則引擎設計
- **§6**: 測試規格（原 `docs/backend/5.test-cases.md`）
- **§7**: 開發階段與進度追蹤（原 `docs/backend/4.todo-list.md`）

## 4. 常用指令

### 環境變數設定（macOS with Homebrew）

建議將以下內容加入 `~/.zshrc` 或 `~/.bashrc`：

```bash
export CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include"
export CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib"
```

### 開發指令（需設定 CGO flags）

```bash
# 進入 backend 目錄
cd backend

# 啟動 API Server
go run cmd/api/main.go

# 啟動 Worker
go run cmd/worker/main.go

# 手動同步發票（開發用）
# 方法 1: 本機直接執行（需修改 configs/config.yaml 的 database.host 為 localhost）
go run cmd/manual_sync/main.go --days 30

# 方法 2: 在 Docker 容器內執行（推薦）
docker exec -it zenbill_api /app/manual_sync --days 30

# 整理依賴
go mod tidy

# 程式碼檢查
golangci-lint run

# 建置專案
go build ./...
```

### 基礎建設 (Docker)
```bash
# 啟動資料庫
docker-compose up -d db pgadmin

# 停止所有容器
docker-compose down

# 查看資料庫 logs
docker-compose logs -f db
```

### 測試
```bash
# 執行單元測試（Domain 層無需 CGO）
go test ./internal/domain/... -v

# 執行 Usecase 測試（需 CGO - 依賴 einvoice package）
go test ./internal/usecase/... -v

# 執行整合測試（需資料庫）
docker-compose up -d db
APP_ENV=test go test ./internal/repository/... -v

# 執行所有測試
go test ./... -v
```

### 手動同步發票 (manual_sync)

`cmd/manual_sync` 是用於手動同步財政部電子發票平台的工具程式。

**參數：**
- `--days N` - 同步過去 N 天的發票（預設 7 天）

**方法 1: 在 Docker 容器內執行（推薦）**
```bash
# 同步過去 30 天的發票
docker exec -it zenbill_api /app/manual_sync --days 30

# 同步過去 7 天（預設值）
docker exec -it zenbill_api /app/manual_sync
```

**方法 2: 本機直接執行**

需要先修改配置文件：
```bash
# 1. 暫時修改 configs/config.yaml
# 將 database.host 從 "db" 改為 "localhost"

# 2. 執行同步
go run cmd/manual_sync/main.go --days 30

# 3. 完成後記得恢復 configs/config.yaml
```

**注意事項：**
- 需要正確設定 `ZENBILL_EINVOICE_PHONE` 和 `ZENBILL_EINVOICE_VERIFY_CODE` 環境變數
- 本機執行需要 Tesseract OCR 支援（需設定 CGO flags）
- 首次執行會自動登入電子發票平台並儲存 Session
- 重複的發票會自動跳過，不會重複寫入資料庫

## 5. 開發規範

### Go 程式碼風格
- **錯誤處理:** 必須顯式處理錯誤，商業邏輯層禁止使用 `panic`。
- **命名規則:**
  - 對外匯出: `PascalCase`
  - 內部使用: `camelCase`
  - 介面: 使用行為命名 (例如: `InvoiceRepository`, `Normalizer`)。
- **設定檔管理:** 使用 `viper` 讀取環境變數（前綴為 `ZENBILL_`）。

### Clean Architecture 分層
- **`cmd/`**: 程式入口，僅負責依賴注入 (Dependency Injection)。
- **`internal/delivery/http`**: HTTP 層，僅負責解析 Request 與回傳 JSON，不包含商業邏輯。
- **`internal/usecase`**: 核心商業邏輯（規則引擎、帳本計算等）。
- **`internal/domain`**: 純淨的實體 (Entities) 與介面定義（禁止 import GORM）。
- **`internal/repository`**: 資料庫實作層（使用 GORM）。

### 資料庫策略
- **交易處理 (Transaction):** 涉及 `transactions` 表寫入與 `accounts` 餘額更新時，務必使用資料庫交易確保 ACID。
- **原始資料保存:** 爬蟲回傳的原始明細存入 `JSONB` 欄位（例如: `invoices.raw_details`）。

### 發票爬蟲開發（Phase 2）
- **Playwright 實作:** 使用 `playwright-go` 進行瀏覽器自動化
- **API 攔截:** 使用 `page.Route()` 而非 `page.OnResponse()`（避免 handler 累積與 deadlock）
- **CAPTCHA OCR:** Tesseract CLI，配合影像預處理（放大、二值化）
- **錯誤處理:** Session 過期自動重登、Cloudflare 挑戰偵測
- **日誌與監控:** Structured logging (zap) + Metrics (duration, count, errors)
- **參考文件:** SPEC.md §4、Memory (`~/.claude/projects/*/memory/MEMORY.md`)

## 6. 命名慣例
- **專案名稱:** ZenBill
- **Go Module:** `github.com/yukiota/zenbill`
- **資料庫名稱:** `zenbill_db`
- **環境變數前綴:** `ZENBILL_`

## 6.5 專案當前狀態 (2026-02-08)

### ✅ 已完成

**Phase 0: 基礎建設**
- Docker Compose (PostgreSQL + pgAdmin)
- Viper config management
- Clean Architecture structure

**Phase 1: 資料模型**
- Domain entities (User, Account, Transaction, Invoice, Merchant, MerchantRule, Category)
- GORM repositories
- Database migration tool
- Domain entity unit tests (15 tests passing)

**Phase 2: 發票爬蟲** ⭐ **剛完成**
- **Phase 2.1-2.6** 完整實作
- Playwright 自動化（登入、查詢、API 攔截）
- CAPTCHA OCR（Tesseract，準確率 >90%）
- InvoiceSyncService（發票同步服務）
- 日誌與效能監控（zap + metrics）
- Integration tests（mock + real DB）

**核心套件:**
- `pkg/database/` - PostgreSQL 連線
- `pkg/einvoice/` - 發票爬蟲（Playwright + OCR）
- `pkg/logger/` - Structured logging
- `pkg/metrics/` - Sync metrics

**工具程式:**
- `cmd/api/` - API Server（基礎框架）
- `cmd/worker/` - 背景排程（基礎框架）
- `cmd/migrate/` - 資料庫遷移
- `cmd/manual_sync/` - 手動同步（開發用）
- `cmd/captcha_trainer/` - OCR 訓練工具

### 🚧 進行中

**Phase 3: 商業邏輯**
- ⏳ Rule Engine usecase（規則匹配邏輯）
- ⏳ Merchant normalization service（商家名稱正規化）
- ⏳ Transaction creation from invoices（從發票建立交易）

### ⏳ 待辦

**Phase 4: API Server**
- REST API endpoints (CRUD)
- Request validation
- Error handling

**Phase 5: 背景排程**
- Daily invoice sync job
- Auto-pay execution

**Phase 6: 收尾**
- Code quality (lint, test coverage)
- Documentation
- Deployment guide

### 🔧 已知問題

1. **CGO 依賴問題:**
   - Tesseract OCR 需要 C 庫（leptonica, tesseract）
   - 需設定 `CGO_CPPFLAGS` 和 `CGO_LDFLAGS`
   - 已在 MEMORY.md 記錄解決方案

2. **文檔重組完成:**
   - 已將 `docs/phase-1/`, `docs/backend/`, `docs/phase-2/` 整合至 `SPEC.md`
   - 已更新 `README.md` 包含快速開始與安裝指南
   - `.claude/skills/` 可能需要更新文件路徑（check-progress, consult-spec 等）

### 📊 統計資訊

- **Domain tests:** 15 tests passing
- **Usecase tests:** InvoiceSyncService integration tests passing
- **Code structure:** Clean Architecture 完整分層
- **Documentation:** README + SPEC + CLAUDE 三文檔體系

## 7. 開發流程（強制性標準作業程序）

⚠️ **重要：本章節定義所有功能開發的強制性標準作業程序（SOP）。**

當使用者使用以下用語請求功能開發時：
- "Start feature [X]" / "開始 feature [X]"
- "Implement [X]" / "實作 [X]"
- "Build [X] functionality" / "開發 [X] 功能"
- "開始開發 [X]"
- "實作 [X] 功能"

你**必須**遵循以下 **4-Phase 開發循環**。這不是選擇性的。

### 🎯 4-Phase 開發循環

```
Phase 1: 情境與設計     → 理解需求與設計方案
Phase 2: 程式實作       → 高品質程式碼撰寫
Phase 3: 測試驗證       → 嚴格測試確保品質
Phase 4: 文件與收尾     → 更新文件與進度追蹤
```

---

### 📖 Phase 1: 情境與設計

**必須執行項目:**
1. **閱讀產品規格**
   - 使用 `consult-spec` skill 或
   - 閱讀 `docs/phase-1/1.user-story.md` 與 `docs/phase-1/2.spec.md`
   - 找出與此功能相關的章節

2. **閱讀技術設計**
   - 使用 `schema-inspector` skill 或
   - 閱讀 `docs/backend/1.technical-architecture.md` 與 `docs/backend/2.database-schema.puml`
   - 了解涉及哪些資料表/實體

3. **建立實作計畫**
   - 總結需求
   - 列出需要修改/建立的檔案
   - 說明實作策略
   - **在進入 Phase 2 前務必取得使用者確認**

**檢查點:**
- ✅ 已審閱規格文件
- ✅ 已理解 Schema 與架構
- ✅ 已建立計畫並經使用者確認

**工具:**
- `context-loader` skill（快速載入所有文件）
- `consult-spec` skill（查詢特定規格）
- `schema-inspector` skill（查看資料庫 Schema）

---

### 💻 Phase 2: 程式實作

**必須執行項目:**
1. **遵循 Clean Architecture**
   - Domain Layer (`internal/domain/`) - 純淨的實體與介面
   - Repository Layer (`internal/repository/`) - 使用 GORM 的資料庫操作
   - Usecase Layer (`internal/usecase/`) - 商業邏輯
   - Delivery Layer (`internal/delivery/http/`) - HTTP 處理器

2. **適時使用程式碼產生工具**
   - 新增實體？→ 使用 `scaffold-domain` skill
   - Regex 規則？→ **必須**使用 `regex-tester` skill 驗證後才能加入程式碼

3. **持續品質檢查**
   - 每完成一個模組後執行 `lint-check` skill
   - 確保程式碼可編譯: `go build ./...`

**檢查點:**
- ✅ 程式碼遵循 Clean Architecture
- ✅ 程式碼通過 `lint-check`
- ✅ 程式碼編譯成功

**工具:**
- `scaffold-domain` skill（產生 Domain Layer 模板）
- `regex-tester` skill（驗證 Regex Pattern - **ZenBill 核心功能**）
- `lint-check` skill（程式碼品質檢查）

---

### 🧪 Phase 3: 測試驗證

**必須執行項目:**
1. **閱讀測試規格**
   - 閱讀 `docs/backend/5.test-cases.md`
   - 識別相關的測試場景

2. **撰寫測試**
   - 單元測試（`*_test.go` 位於 usecase/）
   - 整合測試（`*_test.go` 位於 repository/，如涉及資料庫）
   - 涵蓋成功與錯誤情境

3. **執行測試**
   ```bash
   go test ./... -v
   ```

4. **處理測試失敗**
   - ⚠️ **關鍵：** 如果**任何**測試失敗，你**必須停止**並修復程式碼
   - **絕不可**跳過失敗的測試
   - **絕不可**在有測試失敗時標記功能完成
   - 修復 → 重新執行 → 通過 → 繼續

**檢查點:**
- ✅ 已撰寫單元測試
- ✅ 已撰寫整合測試（如適用）
- ✅ **所有測試通過**（不可妥協）
- ✅ 測試涵蓋主要邏輯分支

**工具:**
- `verify-and-close` skill（自動執行完整驗證流程）

---

### 📝 Phase 4: 文件與收尾

**必須執行項目:**
1. **更新進度** ⚠️ **強制性 - 不可跳過**
   - **務必**在完成任何開發任務後編輯 `docs/backend/4.todo-list.md`
   - 將已完成的任務標記為 `[x]`
   - 為主要階段的完成加上完成日期
   - 記錄實作過程中的關鍵修復或決策
   - 如完成整個階段，更新專案狀態
   - 替代方案：使用 `check-progress` skill 驗證當前狀態

2. **同步文件**（如適用）
   - **資料庫變更？** → 更新 `docs/backend/2.database-schema.puml`
   - **API 變更？** → 更新 `docs/phase-1/2.spec.md`
   - **架構變更？** → 更新 `docs/backend/1.technical-architecture.md`
   - **新增設定？** → 更新 `.env.example` 與設定文件

3. **完成報告**
   - 列出已完成的項目
   - 列出已修改/建立的檔案
   - 報告測試結果（所有測試必須通過）
   - 記錄已修復的錯誤或已解決的問題
   - 根據 TODO list 建議下一步

**檢查點:**
- ✅ TODO list 已更新（不可妥協）
- ✅ 文件已同步（如有變更）
- ✅ 已向使用者報告完成情況
- ✅ 專案狀態反映當前進度

**工具:**
- `check-progress` skill（檢查並更新進度）
- `verify-and-close` skill（完整的驗證與收尾）

---

### 🚀 推薦工作流程

**使用複合型 Skills 達到最高效率:**

```bash
# 方案 1: 手動逐步執行
Phase 1: 使用 `context-loader` + `consult-spec` + `schema-inspector`
Phase 2: 撰寫程式碼 + 使用 `lint-check`
Phase 3-4: 使用 `verify-and-close`（自動處理兩個階段）

# 方案 2: 引導式工作流程（推薦）
使用 `start-feature` skill → 它會自動引導你完成所有 4 個階段
```

**`start-feature` skill 是你的工作流程編排器** - 它確保所有階段都正確執行。

---

### ⛔ 絕對規則（不可妥協）

1. **不可跳過 Phase 1** - 撰寫程式碼前務必閱讀規格
2. **不可跳過 Phase 3** - 所有程式碼必須有測試
3. **不可忽略測試失敗** - 測試失敗 = 功能未完成
4. **不可忘記 Phase 4** - 務必更新 TODO 並同步文件
5. **不可使用未驗證的 Regex** - 規則引擎的 Pattern 務必使用 `regex-tester` 驗證

### ✅ 成功標準

功能被視為「完成」**僅當**滿足以下條件:
- ✅ 符合規格文件（Phase 1）
- ✅ 通過 lint 檢查（Phase 2）
- ✅ 編譯成功（Phase 2）
- ✅ 所有測試通過（Phase 3）
- ✅ TODO 已更新（Phase 4）
- ✅ 文件已同步（Phase 4）

---

## 8. Claude Code Skills（AI 輔助開發）

ZenBill 配備了 **角色導向 Skills**，讓 Claude 能自動判斷何時使用專業工具來確保開發品質。

### Skills 位置
所有 Skills 位於：`.claude/skills/`

### Skills 架構層次

ZenBill 的 Skills 採用三層架構：

```
Layer 3: 工作流程編排
├── start-feature       ← 完整 4-Phase 開發流程
├── verify-and-close    ← Phase 3-4 自動化
└── context-loader      ← 快速載入所有文件

Layer 2: 原子性工具
├── consult-spec            ← 查詢規格
├── check-progress          ← 檢查進度
├── lint-check              ← 程式碼檢查
├── schema-inspector        ← Schema 檢查
├── regex-tester            ← Regex 驗證
├── scaffold-domain         ← 程式碼產生
└── einvoice-scraper-guide  ← Phase 2 爬蟲開發指南
```

### Skills 自動觸發機制
**你不需要手動呼叫這些工具**。Claude 會根據情境自動判斷何時使用：
- 當你說「Start feature X」→ 自動使用 `start-feature` 執行完整 4-Phase 流程
- 當你問「接下來要做什麼？」→ 自動使用 `check-progress`
- 當你說「幫我寫一個規則抓 7-11」→ 自動使用 `regex-tester` 驗證
- 當你要建立新實體 → 自動使用 `schema-inspector` 檢查 Schema
- 當你完成功能開發 → 自動使用 `verify-and-close` 確保品質
- 當你開發 Phase 2 發票同步 → 自動參考 `einvoice-scraper-guide` 實作細節

---

### 🎯 Layer 3: 工作流程編排（複合型流程）

#### `start-feature` - 完整開發流程 ⭐ **推薦使用**
- **用途：** 執行完整的 4-Phase 開發循環（情境 → 實作 → 驗證 → 收尾）
- **觸發關鍵字：** "Start feature X", "實作 X 功能", "開始開發 X"
- **自動呼叫：** `context-loader`, `consult-spec`, `schema-inspector`, `lint-check`, `verify-and-close`
- **手動執行：** `.claude/skills/start-feature/scripts/prepare.sh "功能名稱"`
- **重要性：** 這是 ZenBill 開發流程的總指揮，確保不會遺漏任何步驟

#### `verify-and-close` - 驗證與收尾
- **用途：** 自動執行 Phase 3（測試）和 Phase 4（收尾）
- **觸發時機：** 功能開發完成後
- **包含流程：**
  1. Lint 檢查（`golangci-lint`）
  2. 編譯檢查（`go build`）
  3. 測試執行（`go test`）
  4. TODO 更新
  5. 文件同步檢查
- **手動執行：** `.claude/skills/verify-and-close/scripts/verify.sh`
- **強制規則：** 測試失敗必須停止，不允許標記完成

#### `context-loader` - 快速情境載入
- **用途：** 一次性載入所有專案文件（規格、架構、Schema、TODO）
- **觸發時機：** 開始新功能、初次接觸專案、長時間離開專案後
- **載入內容：**
  - 產品文件: 使用者故事、規格書
  - 技術文件: 架構設計、Schema、TODO、測試案例
  - 專案指南: CLAUDE.md
- **手動執行：**
  - 完整模式：`.claude/skills/context-loader/scripts/load.sh`
  - 摘要模式：`.claude/skills/context-loader/scripts/load.sh --summary`

---

### 👔 Layer 2: PM 角色（產品經理）

#### `consult-spec` - 查詢規格書
- **用途：** 確保開發符合 `docs/phase-1/` 的設計文件
- **觸發時機：** 開發前確認需求、查詢使用者故事、規格
- **手動執行：** `.claude/skills/consult-spec/scripts/search.sh "關鍵字"`

#### `check-progress` - 檢查進度
- **用途：** 查看 Phase-1 待辦事項與完成進度
- **觸發時機：** 「我們現在到哪了？」、「接下來要做什麼？」
- **手動執行：** `.claude/skills/check-progress/scripts/check.sh`

### 🔍 Reviewer 角色（架構/品質保證）

#### `lint-check` - 程式碼品質檢查
- **用途：** 執行 `golangci-lint` 確保程式碼符合規範
- **觸發時機：** 提交前、完成功能後、重構後
- **手動執行：** `.claude/skills/lint-check/scripts/lint.sh`
- **必備工具：** `golangci-lint`（需先安裝）

#### `schema-inspector` - 資料庫 Schema 檢查
- **用途：** 查看 `docs/backend/2.database-schema.puml`
- **觸發時機：** 建立實體、實作 Repository、修改欄位
- **手動執行：** `.claude/skills/schema-inspector/scripts/inspect.sh [table_name]`

### 💻 Coder 角色（開發者）

#### `regex-tester` - Regex 測試器 ⭐ **核心工具**
- **用途：** 測試 Rule Engine 的 Regex Pattern 是否正確匹配商家名稱
- **重要性：** ZenBill 最核心的功能！在寫入 `rule_engine.go` 前必須驗證
- **觸發時機：** 建立/修改商家正規化規則
- **手動執行：**
  ```bash
  go run .claude/skills/regex-tester/scripts/tester.go "^7-11.*" "7-11 敦化店"
  ```
- **範例：**
  ```bash
  # 測試 Uber Eats（忽略大小寫）
  go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\\s*eats" "UBER EATS - Food"
  ```

#### `scaffold-domain` - Domain Layer 產生器
- **用途：** 自動產生 Clean Architecture 的實體與 Repository 模板
- **觸發時機：** 建立新的業務實體（如 Payment, Subscription）
- **手動執行：** `.claude/skills/scaffold-domain/scripts/scaffold.sh EntityName`
- **產生檔案：**
  - `internal/domain/<entity>.go`
  - `internal/repository/<entity>_repository.go`

#### `einvoice-scraper-guide` - 電子發票爬蟲開發指南 ⭐ **Phase 2 專用**
- **用途：** 財政部電子發票平台爬蟲完整開發指南，包含 Playwright 實作、UI 選擇器、API 攔截、錯誤處理、除錯技巧
- **重要性：** Phase 2 發票同步的核心技術文件，包含實戰級程式碼範例
- **觸發時機：**
  - 開始 Phase 2 發票同步功能開發
  - 需要了解登入流程與 API 攔截
  - 除錯爬蟲問題（Session 過期、Cloudflare 挑戰）
  - 查詢 UI 元素選擇器
- **手動查閱：** `.claude/skills/einvoice-scraper-guide/scripts/view.sh [section]`
- **快速查詢範例：**
  ```bash
  # 查看完整指南
  .claude/skills/einvoice-scraper-guide/scripts/view.sh

  # 查看登入流程
  .claude/skills/einvoice-scraper-guide/scripts/view.sh login

  # 查看常見問題
  .claude/skills/einvoice-scraper-guide/scripts/view.sh faq
  ```
- **包含內容：**
  - 完整登入流程與 UI 選擇器（含實際截圖參考）
  - API 攔截策略與資料結構定義
  - 錯誤處理與自動重試機制
  - Playwright 除錯技巧與效能優化
  - 安全性考量（憑證加密、權限最小化）
  - 測試策略與常見問題解決方案

### 🎯 Vibe Coding 工作流程範例

**情境：實作商家正規化規則**

1. **使用者:** "我們接下來要做什麼？"
   - **Claude:** [自動使用 `check-progress`] "根據 TODO，下一步是實作 Rule Engine..."

2. **使用者:** "好，先查一下規格書關於 Rule Engine 的設計"
   - **Claude:** [自動使用 `consult-spec`] "根據 docs/phase-1/2.spec.md:78，Rule Engine 使用 Regex..."

3. **使用者:** "幫我寫一個規則來抓全家便利商店"
   - **Claude:** [自動使用 `regex-tester` 驗證] "我測試過了，這個 Pattern 可以準確匹配..."

4. **使用者:** "好，建立 Merchant entity"
   - **Claude:** [自動使用 `schema-inspector` 查 Schema → 使用 `scaffold-domain` 產生模板] "已建立檔案..."

5. **使用者:** "檢查一下程式碼"
   - **Claude:** [自動使用 `lint-check`] "Lint 通過，沒有問題！"

### 💡 最佳實踐

1. **信任自動化：** Claude 會在適當時機自動使用這些工具，你只需專注在業務需求
2. **關鍵驗證點：**
   - Regex 規則 → **必須**先用 `regex-tester` 驗證
   - 新增實體 → **必須**先用 `schema-inspector` 查 Schema
   - 提交程式碼 → **必須**通過 `lint-check`
3. **手動執行：** 如果你想手動測試，可以直接執行上述腳本

### 📚 延伸閱讀
- 各 Skill 的詳細說明：查看 `.claude/skills/*/SKILL.md`
- Clean Architecture 規範：`docs/backend/1.technical-architecture.md`
- 開發規範：本文件第 5 節
- 專案架構說明：本文件第 2 節
