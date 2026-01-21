---
name: lint-check
description: 執行 golangci-lint 檢查 Go 程式碼品質。在提交程式碼前、完成功能開發後、或用戶要求檢查程式碼品質時使用。
---

# Lint Check (程式碼品質檢查)

## 角色定位
🔍 **Reviewer (Architecture/QA)** - 確保程式碼品質與一致性

## 使用時機
- **提交前必檢**: 在建立 commit 或 PR 之前
- **功能完成後**: 實作完一個模組或功能
- **重構後**: 進行程式碼重構之後
- **用戶請求**: 當用戶說「檢查一下程式碼」或「跑一下 lint」
- **Debug 協助**: 發現奇怪的錯誤時，先跑 lint 確認沒有低級錯誤

## 執行方式

### 方法 1: 使用輔助腳本（推薦）
```bash
.claude/skills/lint-check/scripts/lint.sh
```

### 方法 2: 直接執行 golangci-lint
```bash
golangci-lint run ./...
```

### 方法 3: 檢查特定目錄
```bash
golangci-lint run ./internal/usecase/...
golangci-lint run ./internal/repository/...
```

## Lint 工具配置

ZenBill 使用 **golangci-lint**，這是 Go 生態系最完整的 Linter 集合。

### 安裝 golangci-lint
```bash
# macOS
brew install golangci-lint

# Linux
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin

# 驗證安裝
golangci-lint version
```

### 配置文件
如果專案根目錄有 `.golangci.yml`，lint 會自動讀取設定。

## ZenBill 編碼規範重點

根據 `CLAUDE.md`，ZenBill 的 Go Style 要求：

### ✅ 必須遵守
- **錯誤處理**: 顯式處理所有錯誤，禁止在商業邏輯層使用 `panic`
- **命名規範**:
  - Exported: `PascalCase`
  - Internal: `camelCase`
  - Interfaces: 行為命名 (e.g., `InvoiceRepository`, `Normalizer`)
- **Import 限制**: `internal/domain` 禁止 import GORM

### ❌ 常見錯誤
- 未檢查的錯誤 (`errcheck`)
- 未使用的變數/imports (`unused`)
- 複雜度過高的函數 (`gocyclo`)
- 缺少註解的 exported 函數 (`golint`)

## 輸出解讀

### ✅ 成功案例
```
✅ Lint check passed! Code quality looks good.
```
代表程式碼符合所有品質標準。

### ❌ 失敗案例
```
internal/usecase/invoice.go:45:2: Error return value is not checked (errcheck)
internal/domain/account.go:12:6: exported type Account should have comment (golint)
```

每個錯誤包含：
1. **檔案位置**: `internal/usecase/invoice.go:45:2`
2. **問題描述**: `Error return value is not checked`
3. **Linter 名稱**: `(errcheck)`

## 修復建議流程

1. **分析錯誤**: 理解 linter 報告的問題
2. **查閱規範**: 參考 `CLAUDE.md` 的 Coding Guidelines
3. **修復程式碼**: 按照規範修正
4. **重新檢查**: 再次執行 lint 確認通過
5. **提交變更**: 確保 lint 通過後才 commit

## 與其他 Skills 的配合

### 配合 check-progress
```
我已完成「Invoice Repository」實作，
現在用 lint-check 確保程式碼品質...
[lint 通過]
好的，我將這個任務標記為完成。
```

### 配合 schema-inspector
```
lint 報告 Account struct 的欄位與資料庫不一致，
讓我用 schema-inspector 確認正確的欄位定義...
```

## 自動化建議

在實際開發中，建議設定 **Pre-commit Hook**:
```bash
# .git/hooks/pre-commit
#!/bin/bash
golangci-lint run ./...
if [ $? -ne 0 ]; then
    echo "❌ Lint check failed. Commit aborted."
    exit 1
fi
```

## 注意事項
- **不要跳過 lint**: 即使是小改動，也應該跑 lint
- **不要批量修改**: 發現大量 lint 錯誤時，逐一修正並理解原因
- **不要盲目禁用**: 避免使用 `//nolint` 註解，除非有充分理由
- **保持配置一致**: 不要隨意修改 `.golangci.yml`，應與團隊討論
