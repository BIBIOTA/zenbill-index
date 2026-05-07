# CLAUDE.md 改寫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 `zen-bill/CLAUDE.md` 從 825 行的百科全書式文件改寫為 ~100 行的 AI 工作手冊。

**Architecture:** 保留七個章節的骨架（語言、概覽、架構導航、指令、規範、SOP、坑點），大幅刪除重複 SPEC.md 的內容、Clean Architecture 通識說明、Skills 詳細介紹、專案狀態追蹤。

**Tech Stack:** Markdown（無程式碼變更）

---

### Task 1: 改寫 CLAUDE.md

**Files:**
- Modify: `/Users/yuki/projects/zen-bill/CLAUDE.md`

- [ ] **Step 1: 備份現有 CLAUDE.md**

```bash
cp /Users/yuki/projects/zen-bill/CLAUDE.md /Users/yuki/projects/zen-bill/CLAUDE.md.bak
```

- [ ] **Step 2: 以新內容覆寫 CLAUDE.md**

將 `/Users/yuki/projects/zen-bill/CLAUDE.md` 完整替換為以下內容：

```markdown
# ZenBill 開發指南

**語言:** 繁體中文（zh-TW）。程式碼變數/函式名稱維持英文。

## 專案概覽

ZenBill 是以開發者為導向的自動化記帳系統，核心功能：電子發票自動同步（Playwright 爬蟲）、規則引擎（Regex 商家名稱正規化）、複式簿記（Auto-pay + Double-Entry）。

**技術棧:** Go 1.22+, PostgreSQL 16, Docker, Gin, GORM, Viper, Playwright, Tesseract OCR

## 架構導航

| 目的 | 位置 |
|------|------|
| 查功能需求 / User Story | `SPEC.md §1-2` |
| 查技術架構 / Clean Architecture | `SPEC.md §3` |
| 查發票爬蟲實作細節 | `SPEC.md §4` |
| 查規則引擎設計 | `SPEC.md §5` |
| 查測試案例 | `SPEC.md §6` |
| 查開發進度 / TODO | `SPEC.md §7` |
| 實作業務邏輯 | `backend/internal/usecase/` |
| 定義資料結構 | `backend/internal/domain/` |
| 實作資料存取 | `backend/internal/repository/` |
| 實作 API 端點 | `backend/internal/delivery/http/` |
| 發票爬蟲套件 | `backend/pkg/einvoice/` |

> **注意:** `backend/` 是獨立的 Git Repository，有自己的 `.git/`。

## 常用指令

所有指令在 `backend/` 目錄下執行。需先設定 CGO flags（加入 `~/.zshrc`）：

```bash
export CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include"
export CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib"
```

```bash
# 啟動服務
go run cmd/api/main.go
go run cmd/worker/main.go

# 測試
go test ./internal/domain/... -v          # 單元測試（無需 CGO）
go test ./internal/usecase/... -v         # Usecase 測試（需 CGO）
APP_ENV=test go test ./internal/repository/... -v  # 整合測試（需 DB）
go test ./... -v                          # 全部

# 品質
golangci-lint run
go build ./...

# Docker
docker-compose up -d db pgadmin
docker-compose down

# 手動同步發票（推薦在容器內執行）
docker exec -it zenbill_api /app/manual_sync --days 30

# 打包 APK
./scripts/build-apk.sh           # 正式版
./scripts/build-apk.sh --preview # 測試版（「打包測試版」時使用）
```

## 開發規範

- **Domain layer 禁止 import GORM** 或任何外部框架
- **Regex pattern** 寫入 rule engine 前，必須用 `regex-tester` skill 驗證
- **涉及 `transactions` + `accounts` 同時寫入**，必須使用 DB transaction（ACID）
- **錯誤處理:** 顯式處理所有錯誤，usecase layer 禁止 `panic`
- **環境變數前綴:** `ZENBILL_`（使用 Viper 讀取）
- **Go Module:** `github.com/yukiota/zenbill`

## 4-Phase 開發 SOP

使用 `start-feature` skill 自動執行完整流程。

| Phase | 重點 | 硬規則 |
|-------|------|--------|
| 1 情境 | 讀 SPEC.md，建立計畫 | 實作前必須取得使用者確認 |
| 2 實作 | 遵循 Clean Architecture | 每完成一模組執行 lint |
| 3 測試 | 撰寫並執行測試 | 測試失敗不得標記功能完成 |
| 4 收尾 | 更新 TODO，同步文件 | 不可跳過 |

## 已知坑點

**CGO 依賴**
- Tesseract OCR 需要 C 函式庫（tesseract + leptonica），必須設定 `CGO_CPPFLAGS` / `CGO_LDFLAGS`
- 未設定時 `go build` 會失敗，錯誤訊息為找不到 header file

**manual_sync 本機執行**
- `backend/configs/config.yaml` 預設 `database.host: db`（Docker 網路名稱）
- 本機直接執行需暫時改為 `localhost`，執行完記得還原

**Playwright OnResponse handler 累積**
- `page.OnResponse()` 的 handler 永遠不會自動清除，每次呼叫都會新增一個
- 舊 handler 寫入已滿的 channel 會 block Playwright event loop → deadlock
- **正確做法:** 單次攔截用 `page.ExpectResponse()`；多次攔截用 `doneChan` pattern 讓舊 handler 失效

**E-Invoice 平台 DOM（日期選擇器）**
- `dp__cell_offset`（非當月日期）是 class 在 `.dp__cell_inner`，**不是** `.dp__calendar_item`
- 正確選擇器：`.dp__cell_inner:not(.dp__cell_offset)`
- 錯誤選擇器：`.dp__calendar_item:not(.dp__cell_offset)`（無法過濾，會點到非當月日期）
- 月份/年份按鈕順序：`.dp__month_year_select` 第一個是月份，第二個是年份
```

- [ ] **Step 3: 刪除備份檔**

確認新內容正確後刪除備份：

```bash
rm /Users/yuki/projects/zen-bill/CLAUDE.md.bak
```

- [ ] **Step 4: 確認行數**

```bash
wc -l /Users/yuki/projects/zen-bill/CLAUDE.md
```

預期輸出：100 行左右（±10 行）

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md as concise AI working guide (825 → ~100 lines)"
```
