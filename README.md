# ZenBill

**自動化記帳系統** - 工程師思維的個人財務管理工具

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Go-2EAD33?style=flat)](https://playwright.dev/)

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

驗證碼自動辨識需要 Tesseract OCR（包含 leptonica 依賴）：

```bash
# macOS
brew install tesseract leptonica

# Ubuntu/Debian
sudo apt-get install tesseract-ocr tesseract-ocr-eng libleptonica-dev

# Verify installation
tesseract --version

# Set CGO flags for macOS (add to ~/.zshrc or ~/.bashrc)
export CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include"
export CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib"
```

**建置專案（macOS with Homebrew）:**

```bash
# Build with CGO flags
CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include" \
CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib" \
go build ./...
```

## 📁 Project Structure

```
zen-bill/
├── CLAUDE.md          # 開發指南（AI 輔助開發）
├── README.md          # 本文件
├── SPEC.md            # 產品與技術規格
├── backend/           # Go 後端程式碼
│   ├── cmd/
│   │   ├── api/              # API Server 入口
│   │   ├── worker/           # 背景排程 Worker
│   │   ├── migrate/          # 資料庫遷移工具
│   │   ├── manual_sync/      # 手動發票同步（開發用）
│   │   └── captcha_trainer/  # CAPTCHA OCR 訓練工具
│   ├── internal/
│   │   ├── domain/           # Domain Layer（純淨實體）
│   │   ├── usecase/          # Usecase Layer（商業邏輯）
│   │   ├── repository/       # Repository Layer（資料庫）
│   │   ├── delivery/http/    # HTTP Layer（Gin handlers）
│   │   └── config/           # 配置管理
│   ├── pkg/
│   │   ├── database/         # 資料庫連線
│   │   ├── einvoice/         # 發票爬蟲（Playwright + OCR）
│   │   ├── logger/           # 日誌工具
│   │   └── metrics/          # 效能指標
│   └── configs/              # 配置文件範例
└── .claude/skills/           # AI 輔助開發工具
```

## 🛠️ Development Commands

```bash
# 啟動資料庫
docker-compose up -d db pgadmin

# 停止容器
docker-compose down

# 執行測試（需設定 CGO flags）
CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include" \
CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib" \
go test ./...

# 程式碼檢查
golangci-lint run

# 建置專案（macOS）
CGO_CPPFLAGS="-I/opt/homebrew/opt/leptonica/include -I/opt/homebrew/opt/tesseract/include" \
CGO_LDFLAGS="-L/opt/homebrew/opt/leptonica/lib -L/opt/homebrew/opt/tesseract/lib" \
go build ./...

# 手動同步發票（開發用）
cd backend
go run cmd/manual_sync/main.go
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
