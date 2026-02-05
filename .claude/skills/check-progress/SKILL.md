---
name: check-progress
description: 檢查 ZenBill 當前 Phase 的開發進度，顯示已完成和待辦任務。當用戶問「進度如何」、「還剩什麼要做」或需要規劃下一步工作時使用。
---

# Check Progress (檢查進度)

## 角色定位
📋 **PM (Product Manager)** - 追蹤專案進度與任務管理

## 使用時機
- 用戶詢問「我們現在到哪了？」
- 需要知道「接下來要做什麼？」
- 想查看「還有哪些功能未完成？」
- 開始新的工作階段，需要了解當前狀態
- 完成一個大任務後，確認下一步

## 執行方式

### 方法 1: 使用輔助腳本（推薦）
```bash
.claude/skills/check-progress/scripts/check.sh
```

顯示前 5 個待辦事項（預設）

```bash
.claude/skills/check-progress/scripts/check.sh 10
```

顯示前 10 個待辦事項

### 方法 2: 直接讀取文件
```bash
# 讀取 TODO List
cat docs/backend/4.todo-list.md

# 或使用 grep 過濾
grep "^- \[ \]" docs/backend/4.todo-list.md  # 未完成
grep "^- \[x\]" docs/backend/4.todo-list.md  # 已完成
```

## TODO List 位置
- **Phase 1**: `docs/backend/4.todo-list.md`

## TODO List 格式
```markdown
- [ ] 未完成的任務
- [x] 已完成的任務
```

## 輸出建議格式

當使用此 Skill 時，應提供：

1. **進度摘要**
   - 總任務數
   - 已完成數量
   - 待完成數量
   - 完成百分比（可選）

2. **下一步任務** (Top 3-5)
   - 按優先順序列出
   - 提供任務描述

3. **建議行動**
   - 推薦從哪個任務開始
   - 說明該任務的重要性

## 範例輸出

```
📊 ZenBill Phase-1 Progress
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total:   24 tasks
Done:    15 ✅
Pending:  9 ⏳
Progress: 62.5%

🔜 Next 5 tasks to complete:
1. Implement E-Invoice API Client
2. Build Rule Engine for merchant normalization
3. Create Ledger Calculator (Double-Entry)
4. Add Auto-pay scheduler
5. Write integration tests for invoice sync

💡 建議：優先完成「E-Invoice API Client」，
   這是後續功能的基礎依賴。
```

## 範例對話

```
User: 我們現在進度如何？
Assistant: 讓我檢查一下當前的進度...
[使用 check-progress skill]

根據 TODO List，Phase-1 已完成 62.5%。
目前最重要的待辦項目是「實作 E-Invoice API Client」，
這是發票同步功能的核心模組。

要開始實作這個功能嗎？我可以先幫你查詢規格書確認需求。
```

## 與其他 Skills 的配合

- **配合 consult-spec**: 確認待辦任務的規格
  ```
  我看到下一個任務是「實作自動扣款」，
  讓我先用 consult-spec 查詢相關規格...
  ```

- **配合 lint-check**: 完成任務前的品質檢查
  ```
  我已完成「E-Invoice Client」，
  讓我用 lint-check 確保程式碼品質...
  ```

## 注意事項
- TODO List 應該與實際進度同步更新
- 完成任務後記得標記 `[x]`
- 如果發現新的必要任務，應該加入 TODO List
