---
name: verify-and-close
description: 執行完整的驗證與收尾流程。在功能開發完成後使用，確保測試通過、文件同步、進度更新。這是 Phase 3 和 Phase 4 的自動化執行器。
---

# Verify and Close (驗證與收尾)

## 🎯 角色定位
**Quality Gatekeeper** - 品質把關與專案收尾的自動化執行器

## 重要性
這是 **開發流程的最後防線**！

確保沒有任何功能在未經測試的情況下被標記為完成，同時保證專案文件與實作保持同步。

## 觸發時機
- 功能開發完成，準備進入測試階段
- 用戶說「測試一下」、「檢查程式碼」、「完成了嗎」
- `start-feature` 的 Phase 3-4 階段
- 準備提交 commit 之前

## 自動執行的流程

### 🧪 Part 1: Verification (Phase 3)

#### Step 1: 程式碼品質檢查
```bash
# 自動執行 lint-check
golangci-lint run ./...
```

**失敗處理：**
- ❌ 如果 lint 失敗 → **STOP**，要求修正
- ✅ 通過後繼續

#### Step 2: 編譯檢查
```bash
go build ./...
```

**失敗處理：**
- ❌ 如果編譯失敗 → **STOP**，要求修正
- ✅ 通過後繼續

#### Step 3: 測試執行
```bash
# Unit Tests
go test ./internal/usecase/... -v

# Integration Tests (if applicable)
APP_ENV=test go test ./internal/repository/... -v

# All Tests
go test ./... -v
```

**失敗處理：**
- ❌ 如果任何測試失敗 → **STOP**，要求修正
- ⚠️ 如果沒有測試 → 警告並詢問是否需要撰寫
- ✅ 所有測試通過後繼續

#### Step 4: 測試覆蓋率報告（可選）
```bash
go test ./... -cover
```

---

### 📝 Part 2: Closure (Phase 4)

#### Step 1: 更新 TODO 進度

**自動檢查：**
1. 讀取 `docs/backend/4.todo-list.md`
2. 找出當前正在處理的任務
3. 標記為 `[x]` 完成

**輸出範例：**
```
✅ Updated TODO:
   [x] 實作信用卡自動扣款功能
```

#### Step 2: 文件同步檢查

**自動檢查項目：**

1. **資料庫變更檢查**
   - 比對 `internal/domain/*.go` 與 `docs/backend/2.database-schema.puml`
   - 如果新增或修改了 Entity → 提示需要更新 Schema 文件

2. **API 變更檢查**
   - 檢查 `internal/delivery/http/*.go` 是否有新增或修改 endpoint
   - 如果有 → 提示需要更新 `docs/phase-1/2.spec.md`

3. **架構變更檢查**
   - 檢查是否新增了新的 Layer 或模組
   - 如果有 → 提示需要更新 `docs/backend/1.technical-architecture.md`

**輸出範例：**
```
📋 Documentation Sync Check:

✅ Database Schema: No changes needed
⚠️  API Specification: New endpoint detected
    → Please update docs/phase-1/2.spec.md
    → New endpoint: POST /api/v1/auto-pay

✅ Architecture: No changes needed
```

#### Step 3: 生成完成報告

**報告內容：**
- ✅ Lint 狀態
- ✅ 測試結果（通過/失敗數量）
- ✅ 測試覆蓋率
- ✅ TODO 更新狀態
- ⚠️ 需要手動同步的文件（如有）
- 📊 修改的檔案列表

---

## 完整執行範例

### 觸發
```
User: 我已經完成開發了，幫我檢查一下
```

### Claude 執行

```
Claude:
🔍 開始執行驗證與收尾流程...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 Part 1: Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1/4: Lint Check
  [執行] golangci-lint run ./...
  ✅ PASS - No issues found

Step 2/4: Build Check
  [執行] go build ./...
  ✅ PASS - Build successful

Step 3/4: Running Tests
  [執行] go test ./... -v

  === RUN   TestAutoPayUsecase_Success
  ✅ PASS (0.05s)

  === RUN   TestAutoPayUsecase_InsufficientBalance
  ✅ PASS (0.03s)

  === RUN   TestAutoPayUsecase_DoubleEntry
  ✅ PASS (0.04s)

  📊 Total: 3 passed, 0 failed

Step 4/4: Coverage Report
  ✅ Coverage: 85.2%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Part 2: Closure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: TODO Update
  ✅ Updated: docs/backend/4.todo-list.md
     [x] 實作信用卡自動扣款功能

Step 2: Documentation Sync Check
  ✅ Database Schema: No changes
  ✅ API Spec: No changes
  ✅ Architecture: No changes

Step 3: Completion Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 Feature Development Completed!

📊 Summary:
   Lint:     ✅ PASS
   Build:    ✅ PASS
   Tests:    ✅ 3/3 passed
   Coverage: 85.2%
   TODO:     ✅ Updated

📁 Files Modified:
   - internal/usecase/auto_pay_usecase.go (new)
   - internal/usecase/auto_pay_usecase_test.go (new)
   - docs/backend/4.todo-list.md (updated)

🔜 Next Steps:
   - Ready to commit
   - Next TODO: "實作發票同步排程器"

All quality gates passed! ✨
```

---

## 失敗處理範例

### 測試失敗情境
```
Claude:
🧪 Part 1: Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 3/4: Running Tests
  [執行] go test ./... -v

  === RUN   TestAutoPayUsecase_Success
  ✅ PASS

  === RUN   TestAutoPayUsecase_InsufficientBalance
  ❌ FAIL - Expected error, got nil

  📊 Total: 1 passed, 1 failed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⛔ VERIFICATION FAILED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Tests did not pass. Cannot proceed to closure.

🔧 Action Required:
1. Fix the failing test: TestAutoPayUsecase_InsufficientBalance
2. The test expects an error when balance is insufficient
3. Check your error handling logic in auto_pay_usecase.go:45

💡 After fixing, run:
   go test ./internal/usecase/... -v

Cannot mark TODO as complete until all tests pass.
```

---

## 手動執行

```bash
# 完整驗證與收尾流程
.claude/skills/verify-and-close/scripts/verify.sh

# 只執行測試（不更新 TODO）
.claude/skills/verify-and-close/scripts/verify.sh --test-only

# 跳過測試，只做收尾（不建議）
.claude/skills/verify-and-close/scripts/verify.sh --skip-tests
```

---

## 與其他 Skills 的配合

### 自動呼叫
- `lint-check` - 程式碼品質檢查
- `check-progress` - TODO 更新

### 配合 start-feature
```
start-feature (Phase 1-2)
    ↓
verify-and-close (Phase 3-4)
    ↓
功能完成！
```

---

## 檢查清單 (Checklist)

在執行 `verify-and-close` 前，確保：

**Phase 3 (Verification):**
- [ ] 程式碼通過 lint
- [ ] 程式碼可以編譯
- [ ] 已撰寫單元測試
- [ ] 已撰寫整合測試（如需要）
- [ ] 所有測試通過

**Phase 4 (Closure):**
- [ ] TODO 已更新
- [ ] 如有 Schema 變更 → 已更新 `.puml`
- [ ] 如有 API 變更 → 已更新 `spec.md`
- [ ] 如有架構變更 → 已更新 `technical-architecture.md`

---

## 配置選項

### 測試覆蓋率門檻（可選）
如果你想強制要求測試覆蓋率達到一定標準，可以設定：

```bash
# 要求至少 80% 覆蓋率
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out | grep total | awk '{print $3}'
# 如果低於 80% → 警告
```

### 自動文件同步（進階）
未來可以擴充此 Skill 來自動更新文件：
- 解析新增的 API endpoint 自動加入 spec.md
- 解析新增的 Entity 自動更新 schema.puml

---

## 強制規則

### ⚠️ 不可妥協的原則
1. **測試失敗 = 功能未完成**
   - 不允許跳過失敗的測試
   - 不允許「先標記完成，晚點再修」

2. **Lint 失敗 = 程式碼不合格**
   - 必須修正所有 lint 問題
   - 不允許使用 `//nolint` 繞過（除非有充分理由）

3. **TODO 必須更新**
   - 完成的任務必須標記 `[x]`
   - 新發現的任務必須加入清單

### ✅ 最佳實踐
- 先修正 lint 再寫測試（避免浪費時間）
- 測試應該涵蓋正常流程與錯誤處理
- 文件同步應該在功能完成當下進行（不要拖延）

---

## 總結

**`verify-and-close` 是品質的守門員。**

它確保每個功能在標記為完成前都：
1. ✅ 通過品質檢查（Lint）
2. ✅ 可以成功編譯（Build）
3. ✅ 通過所有測試（Tests）
4. ✅ 更新專案進度（TODO）
5. ✅ 同步相關文件（Docs）

**沒有通過 verify-and-close 的功能，就不算完成！**
