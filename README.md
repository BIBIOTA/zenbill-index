# ZenBill

**自動化記帳系統** - 工程師思維的個人財務管理工具

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Go-2EAD33?style=flat)](https://playwright.dev/)

## 📖 專案概覽

ZenBill 是一個以「自動化」為核心的記帳系統，專為有技術背景的使用者設計：

- **🔄 自動化發票同步** - 透過 Playwright 爬蟲自動抓取財政部電子發票資料
- **🧠 規則引擎** - 使用 Regex/關鍵字自動清洗商家名稱並歸類
- **💳 資產生命週期** - 模擬信用卡自動扣款與複式簿記

## 🚀 Quick Start

### Prerequisites

- Go 1.22+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)
- Tesseract OCR (for captcha recognition)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/yukiota/zenbill.git
cd zenbill

# 2. Setup backend
cd backend
cp .env.example .env
cp configs/config.yaml.example configs/config.yaml

# 3. Start database
docker-compose up -d db pgadmin

# 4. Install dependencies
go mod download

# 5. Run migrations
go run cmd/migrate/main.go

# 6. Start API server
go run cmd/api/main.go
```

### Tesseract OCR Installation

驗證碼自動辨識需要 Tesseract OCR：

```bash
# macOS
brew install tesseract

# Ubuntu/Debian
sudo apt-get install tesseract-ocr tesseract-ocr-eng

# Verify installation
tesseract --version
```

## 📁 Project Structure

```
zen-bill/
├── CLAUDE.md          # 開發指南（AI 輔助開發）
├── README.md          # 本文件
├── SPEC.md            # 產品與技術規格
├── backend/           # Go 後端程式碼
│   ├── cmd/           # 程式入口點
│   ├── internal/      # 內部程式碼（Clean Architecture）
│   ├── pkg/           # 共享套件
│   └── configs/       # 配置文件
├── docs/              # 開發文件與計畫
└── .claude/skills/    # AI 輔助開發工具
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
```

## 📊 Database Access

- **PGAdmin**: http://localhost:5050
  - Login: `admin@zenbill.local` / `admin`
- **Database**: `zenbill_db`
- **User**: `zenbill`
- **Port**: `5432`

## 📚 Documentation

| 文件 | 說明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | 開發指南、專案架構、Skills 使用說明 |
| [SPEC.md](./SPEC.md) | 產品規格、技術架構、測試案例 |

## 🔧 Environment Variables

所有配置透過 `ZENBILL_` 前綴的環境變數設定：

```bash
ZENBILL_DB_HOST=localhost
ZENBILL_DB_PORT=5432
ZENBILL_DB_NAME=zenbill_db
ZENBILL_EINVOICE_PHONE=your_phone
ZENBILL_EINVOICE_VERIFY_CODE=your_code
```

## 📝 License

Private Project - All Rights Reserved
