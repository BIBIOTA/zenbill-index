# Tesseract OCR 安裝指南

本文件說明如何在不同平台安裝 Tesseract OCR，以支援 ZenBill 的驗證碼自動辨識功能。

---

## 📋 系統需求

- **Tesseract OCR**: 4.0 或更高版本
- **Leptonica**: 圖像處理庫（Tesseract 依賴）
- **英文語言包**: `tesseract-ocr-eng`

---

## 🍎 macOS 安裝

### 方法 1: 使用 Homebrew（推薦）

```bash
# 安裝 Tesseract OCR
brew install tesseract

# 驗證安裝
tesseract --version

# 預期輸出類似：
# tesseract 5.3.3
#  leptonica-1.83.1
```

### 方法 2: 從原始碼編譯

```bash
# 安裝依賴
brew install leptonica

# 下載 Tesseract
git clone https://github.com/tesseract-ocr/tesseract.git
cd tesseract

# 編譯安裝
./autogen.sh
./configure
make
sudo make install
```

### 語言包確認

```bash
# 查看已安裝的語言包
tesseract --list-langs

# 預期包含 'eng'（英文）
```

如果未包含英文，手動安裝：
```bash
brew install tesseract-lang
```

---

## 🐧 Ubuntu/Debian 安裝

### 方法 1: 使用 apt（推薦）

```bash
# 更新套件列表
sudo apt-get update

# 安裝 Tesseract 與英文語言包
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng

# 驗證安裝
tesseract --version
```

### 方法 2: 使用 PPA（獲取最新版本）

```bash
# 新增 PPA
sudo add-apt-repository ppa:alex-p/tesseract-ocr-devel
sudo apt-get update

# 安裝
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng
```

### 方法 3: 從原始碼編譯

```bash
# 安裝依賴
sudo apt-get install -y \
    automake \
    ca-certificates \
    g++ \
    git \
    libtool \
    libleptonica-dev \
    make \
    pkg-config

# 下載並編譯 Tesseract
git clone https://github.com/tesseract-ocr/tesseract.git
cd tesseract
./autogen.sh
./configure
make
sudo make install
sudo ldconfig

# 下載語言包
cd /usr/local/share/tessdata
sudo wget https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
```

---

## 🐳 Docker 環境安裝

### Dockerfile 範例

```dockerfile
FROM golang:1.22-alpine

# 安裝 Tesseract OCR
RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-eng

# 驗證安裝
RUN tesseract --version

# 繼續其他建置步驟...
WORKDIR /app
COPY . .
RUN go mod download
RUN go build -o zenbill cmd/api/main.go

CMD ["./zenbill"]
```

### 測試 Docker 映像

```bash
# 建置映像
docker build -t zenbill-test .

# 測試 Tesseract
docker run --rm zenbill-test tesseract --version
```

---

## 🪟 Windows 安裝

### 方法 1: 使用安裝程式（推薦）

1. 下載安裝程式：
   - 前往 [UB Mannheim Tesseract](https://github.com/UB-Mannheim/tesseract/wiki)
   - 下載 `tesseract-ocr-w64-setup-v5.x.x.exe`

2. 執行安裝程式
   - 安裝路徑建議：`C:\Program Files\Tesseract-OCR`
   - **重要**: 勾選 "Add to PATH"

3. 驗證安裝
   ```cmd
   tesseract --version
   ```

### 方法 2: 使用 Chocolatey

```powershell
# 安裝 Tesseract
choco install tesseract

# 驗證
tesseract --version
```

### 設定環境變數

如果未自動加入 PATH，手動設定：

```powershell
# 設定 TESSERACT_PATH
setx TESSERACT_PATH "C:\Program Files\Tesseract-OCR\tesseract.exe"

# 設定 TESSDATA_PREFIX
setx TESSDATA_PREFIX "C:\Program Files\Tesseract-OCR\tessdata"
```

---

## ✅ 安裝驗證

### 基本測試

```bash
# 檢查版本
tesseract --version

# 列出語言包
tesseract --list-langs

# 測試辨識（建立測試圖片）
echo "Hello World" | convert label:@- test.png
tesseract test.png stdout
# 預期輸出: Hello World
```

### Go 套件測試

```bash
# 進入專案目錄
cd /path/to/zen-bill

# 執行測試
go test ./pkg/einvoice/captcha/... -v

# 如果 Tesseract 正確安裝，測試應該通過
```

---

## 🐛 常見問題

### Q1: 找不到 'leptonica/allheaders.h'

**原因**: Leptonica 未正確安裝

**解決方法**:
```bash
# macOS
brew install leptonica

# Ubuntu
sudo apt-get install libleptonica-dev

# 然後重新編譯 Go 專案
go clean -cache
go build ./...
```

### Q2: 'tesseract' command not found

**原因**: Tesseract 未加入 PATH

**解決方法**:
```bash
# 尋找 Tesseract 安裝位置
find /usr -name tesseract 2>/dev/null

# 手動加入 PATH（暫時）
export PATH=$PATH:/usr/local/bin

# 永久加入 PATH（加到 ~/.bashrc 或 ~/.zshrc）
echo 'export PATH=$PATH:/usr/local/bin' >> ~/.bashrc
source ~/.bashrc
```

### Q3: Docker 容器內無法執行 Tesseract

**原因**: Alpine Linux 預設 musl libc，可能與某些套件不相容

**解決方法**: 使用 Debian-based 映像
```dockerfile
FROM golang:1.22-bookworm

RUN apt-get update && \
    apt-get install -y tesseract-ocr tesseract-ocr-eng && \
    rm -rf /var/lib/apt/lists/*
```

### Q4: 辨識結果為空白

**原因**: 語言包未正確載入

**檢查語言包位置**:
```bash
# macOS Homebrew
ls /usr/local/share/tessdata/

# Ubuntu
ls /usr/share/tesseract-ocr/4.00/tessdata/

# 確認包含 eng.traineddata
```

**解決方法**: 設定環境變數
```bash
export TESSDATA_PREFIX=/usr/local/share/tessdata
```

---

## 📊 驗證清單

安裝完成後，確認以下項目：

- [ ] `tesseract --version` 顯示版本資訊
- [ ] `tesseract --list-langs` 包含 `eng`
- [ ] `go build ./pkg/einvoice/captcha` 編譯成功
- [ ] `go test ./pkg/einvoice/captcha/... -v` 測試通過
- [ ] 環境變數 `TESSDATA_PREFIX` 正確設定（如需要）

---

## 🔗 參考資源

- [Tesseract GitHub](https://github.com/tesseract-ocr/tesseract)
- [Tesseract 官方文件](https://tesseract-ocr.github.io/)
- [gosseract GitHub](https://github.com/otiai10/gosseract)
- [Leptonica 官網](http://www.leptonica.org/)

---

## 📝 下一步

完成 Tesseract 安裝後：

1. 回到專案根目錄
2. 執行測試: `go test ./pkg/einvoice/captcha/... -v`
3. 如果測試通過，繼續 Phase 2 爬蟲整合
4. 收集真實驗證碼樣本進行調參

---

**文件版本**: 1.0
**最後更新**: 2026-01-27
