# README 重組 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 index README 精簡為入口頁，並將操作細節分散至 backend、frontend、app 各自的 README。

**Architecture:** 四個 Markdown 檔案各司其職——index 只呈現「這是什麼」，三個子 repo README 各呈現「怎麼用」。不新增功能內容，只搬移。

**Tech Stack:** Markdown、CC BY-NC-ND 4.0 License

---

### Task 1: 改寫 `zen-bill/README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 用以下內容完整取代 `README.md`**

```markdown
# ZenBill

**自動化記帳系統** - 工程師思維的個人財務管理工具

[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Go-2EAD33?style=flat)](https://playwright.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-55-000020?style=flat&logo=expo)](https://expo.dev/)

## 📖 專案概覽

ZenBill 是一個以「自動化」為核心的記帳系統，專為有技術背景的使用者設計：

- **🔄 自動化發票同步** - 透過 Playwright 爬蟲自動抓取財政部電子發票資料
  - ✅ 手機條碼登入
  - ✅ CAPTCHA OCR 自動辨識（Tesseract，準確率 >90%）
  - ✅ API Response 攔截
  - ✅ 發票明細解析與儲存
- **🧠 規則引擎** - 使用 Regex/關鍵字自動清洗商家名稱並歸類
  - ✅ Domain 模型完成
  - 🚧 Usecase 開發中
- **💳 資產生命週期** - 模擬信用卡自動扣款與複式簿記
  - ✅ Account & Transaction entities
  - 🚧 Auto-pay 邏輯開發中

## 📁 Project Structure

```
zen-bill/
├── backend/     # Go API Server、發票爬蟲、規則引擎
├── frontend/    # React 19 + Vite Web 介面
├── app/         # Expo + React Native 行動應用
├── SPEC.md      # 產品與技術規格
└── CLAUDE.md    # AI 輔助開發指南
```

## 📚 Documentation

| 文件 | 說明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | 開發指南、專案架構、Skills 使用說明 |
| [SPEC.md](./SPEC.md) | 產品規格、技術架構、測試案例 |

## 📝 License

[![CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-nd/4.0/)

© 2025 Yuki Ota. This project is licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/).  
Source code is shared for reference purposes only. Modification and commercial use are not permitted.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: simplify index README to entry page"
```

---

### Task 2: 新建 `backend/README.md`

**Files:**
- Create: `backend/README.md`

- [ ] **Step 1: 建立 `backend/README.md`，內容如下**

```markdown
# ZenBill Backend

Go API Server、財政部電子發票爬蟲、規則引擎。

## 🛠 Tech Stack

- **Go 1.25+** — API Server（Gin）、爬蟲、規則引擎
- **PostgreSQL 16** — 主要資料庫（GORM）
- **Playwright Go** — 瀏覽器自動化（發票爬蟲）
- **Tesseract OCR** — CAPTCHA 自動辨識

## 📋 Prerequisites

- Go 1.25+
- Docker & Docker Compose
- Tesseract OCR + leptonica

### Tesseract OCR 安裝

```bash
# macOS
brew install tesseract leptonica

# Ubuntu/Debian
sudo apt-get install tesseract-ocr libleptonica-dev

# 確認安裝
tesseract --version
```

### CGO Flags（macOS with Homebrew）

將以下內容加入 `~/.zshrc` 或 `~/.bashrc`：

```bash
export CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include"
export CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib"
```

## 🚀 Installation

```bash
cd backend

# 複製設定檔
cp .env.example .env
cp configs/config.yaml.example configs/config.yaml

# 啟動資料庫
docker-compose up -d db pgadmin

# 安裝依賴
go mod download

# 執行資料庫遷移
go run cmd/migrate/main.go

# 啟動 API Server
go run cmd/api/main.go
```

## 📁 Project Structure

```
backend/
├── cmd/
│   ├── api/              # API Server 入口
│   ├── worker/           # 背景排程 Worker
│   ├── migrate/          # 資料庫遷移工具
│   ├── manual_sync/      # 手動發票同步（開發用）
│   └── captcha_trainer/  # CAPTCHA OCR 訓練工具
├── internal/
│   ├── domain/           # Domain Layer（純淨實體）
│   ├── usecase/          # Usecase Layer（商業邏輯）
│   ├── repository/       # Repository Layer（資料庫）
│   ├── delivery/http/    # HTTP Layer（Gin handlers）
│   └── config/           # 配置管理
├── pkg/
│   ├── database/         # 資料庫連線
│   ├── einvoice/         # 發票爬蟲（Playwright + OCR）
│   ├── logger/           # 日誌工具
│   └── metrics/          # 效能指標
└── configs/              # 配置文件範例
```

## 🛠️ Development Commands

```bash
# 啟動資料庫
docker-compose up -d db pgadmin

# 停止容器
docker-compose down

# 執行測試
go test ./...

# 程式碼檢查
golangci-lint run

# 建置專案
go build ./...

# 手動同步發票（開發用）
go run cmd/manual_sync/main.go --days 30
```

## 📊 Database Access

- **PGAdmin**: http://localhost:5050
  - Login: `admin@zenbill.local` / `admin`
- **Database**: `zenbill_db`
- **User**: `zenbill`
- **Port**: `5432`

## 🔧 Environment Variables

所有配置透過 `ZENBILL_` 前綴的環境變數設定：

```bash
ZENBILL_DB_HOST=localhost
ZENBILL_DB_PORT=5432
ZENBILL_DB_NAME=zenbill_db
ZENBILL_EINVOICE_PHONE=your_phone
ZENBILL_EINVOICE_VERIFY_CODE=your_code
```
```

- [ ] **Step 2: Commit**

```bash
git add backend/README.md
git commit -m "docs: add backend README with installation and dev commands"
```

---

### Task 3: 改寫 `frontend/README.md`

**Files:**
- Modify: `frontend/README.md`

- [ ] **Step 1: 用以下內容完整取代 `frontend/README.md`**

```markdown
# ZenBill Frontend

React 19 + Vite Web 介面。

## 🛠 Tech Stack

- **React 19** — UI 框架
- **TypeScript 5.9** — 靜態型別
- **Vite 7** — 開發伺服器與打包工具

## 🚀 Installation

```bash
cd frontend
npm install
```

## 🛠️ Development Commands

```bash
# 啟動開發伺服器
npm run dev

# 建置
npm run build

# 預覽正式建置結果
npm run preview

# Lint 檢查
npm run lint
```
```

- [ ] **Step 2: Commit**

```bash
git add frontend/README.md
git commit -m "docs: rewrite frontend README"
```

---

### Task 4: 新建 `app/README.md`

**Files:**
- Create: `app/README.md`

- [ ] **Step 1: 建立 `app/README.md`，內容如下**

```markdown
# ZenBill App

Expo + React Native 行動應用。

## 🛠 Tech Stack

- **Expo 55** — React Native 開發框架
- **React Native 0.83** — 行動應用框架
- **TypeScript** — 靜態型別

## 🚀 Installation

```bash
cd app
npm install
```

## 🛠️ Development Commands

```bash
# 啟動 Expo 開發伺服器
npx expo start

# 在 Android 模擬器執行
npx expo run:android

# 在 iOS 模擬器執行
npx expo run:ios
```

### 打包 APK

```bash
# 正式版（自動 bump version、上傳 GitHub Release）
./scripts/build-apk.sh

# 測試版（Preview APK，可與正式版同時安裝）
./scripts/build-apk.sh --preview
```

測試版特性：
- Package name: `com.zenbill.app.preview`
- App 名稱: `ZenBill Dev`（附橘色 DEV 角標）
- API 指向 Tailscale 測試環境
```

- [ ] **Step 2: Commit**

```bash
git add app/README.md
git commit -m "docs: add app README with installation and build commands"
```
