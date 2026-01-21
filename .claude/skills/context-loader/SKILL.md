---
name: context-loader
description: 一次性載入所有開發相關的文件，包括規格、架構、Schema、TODO。在開始新功能開發或需要快速理解專案狀態時使用。
---

# Context Loader (快速情境載入)

## 🎯 角色定位
**Context Aggregator** - 專案文件的快速聚合器

## 用途
這是一個 **輔助工具**，用於加速 `start-feature` 的 Phase 1。

它會一次性讀取並顯示所有開發相關的核心文件，讓 Claude 或開發者快速掌握專案狀態，而不需要逐個打開文件。

## 使用時機
- 開始新功能開發前（配合 `start-feature`）
- 新成員 onboarding
- 長時間離開專案後重新開始
- 需要快速回顧專案設計
- Debug 時需要查看完整脈絡

## 載入的文件

### 📄 產品層（Product）
```
docs/phase-1/
├── 1.user-story.md        ← User Story 與驗收標準
└── 2.spec.md              ← 詳細規格說明
```

### ⚙️ 技術層（Technical）
```
backend/phase-1/
├── 1.technical-architecture.md  ← 架構設計
├── 2.database-schema.puml       ← 資料庫 Schema (ER Diagram)
├── 3.backend-architecture.puml  ← 程式分層圖
├── 4.todo-list.md               ← 開發待辦清單
└── 5.test-cases.md              ← 測試案例
```

### 📋 專案配置
```
CLAUDE.md                   ← 專案 Context 與 Coding Guidelines
```

## 執行方式

### 完整載入（預設）
```bash
.claude/skills/context-loader/scripts/load.sh
```

顯示所有文件的完整內容。

### 摘要模式
```bash
.claude/skills/context-loader/scripts/load.sh --summary
```

只顯示每個文件的：
- 前 20 行（標題與摘要）
- 檔案大小
- 最後修改時間

### 特定文件
```bash
# 只載入產品文件
.claude/skills/context-loader/scripts/load.sh --product-only

# 只載入技術文件
.claude/skills/context-loader/scripts/load.sh --tech-only

# 只載入 TODO
.claude/skills/context-loader/scripts/load.sh --todo-only
```

---

## 輸出範例

### 完整模式輸出
```
📚 ZenBill Context Loader
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Loading all project documentation...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 PRODUCT LAYER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 File: docs/phase-1/1.user-story.md
────────────────────────────────────────

[完整內容...]

📖 File: docs/phase-1/2.spec.md
────────────────────────────────────────

[完整內容...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️  TECHNICAL LAYER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 File: backend/phase-1/1.technical-architecture.md
────────────────────────────────────────

[完整內容...]

[... 其他文件 ...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CONTEXT LOADING COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Loaded 7 files
📦 Total size: 45.2 KB
⏱️  Estimated reading time: 15 minutes

💡 You now have full context of ZenBill project!
```

### 摘要模式輸出
```
📚 ZenBill Context Loader (Summary Mode)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 PRODUCT LAYER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 1.user-story.md
   Size: 8.5 KB
   Modified: 2024-01-15 14:30
   Preview:
   # ZenBill User Stories
   ## US001: 電子發票同步
   作為使用者，我想要自動同步財政部電子發票...
   [showing first 20 lines]

📖 2.spec.md
   Size: 15.2 KB
   Modified: 2024-01-16 09:45
   Preview:
   # ZenBill Product Specification
   ## 1. 概述
   ZenBill 是一個自動化記帳系統...
   [showing first 20 lines]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️  TECHNICAL LAYER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[... 其他文件摘要 ...]

📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total files: 7
Total size: 45.2 KB

💡 Use --full to see complete content
```

---

## 與其他 Skills 的配合

### 配合 start-feature
```
start-feature (自動呼叫 context-loader)
    ↓
Phase 1: 已載入所有文件
    ↓
繼續 Phase 2-4...
```

### 配合 consult-spec
```
context-loader (載入全部)
    ↓
consult-spec (精確搜尋特定關鍵字)
```

**區別：**
- `context-loader`: 廣泛的、全面的理解
- `consult-spec`: 針對性的、精確的查詢

---

## 使用場景

### 場景 1: 新功能開發
```
User: Start feature "發票自動分類"
Claude: [自動使用 context-loader 載入所有文件]
        根據規格，發票分類需要使用 Rule Engine...
```

### 場景 2: 快速回顧
```
User: 我忘記這個專案在做什麼了
Claude: [使用 context-loader --summary]
        這是 ZenBill 專案，主要功能包括...
```

### 場景 3: Onboarding
```
User: 我是新加入的開發者，怎麼開始？
Claude: [使用 context-loader]
        讓我幫你載入專案文件...
        [顯示完整文件]

        這個專案使用 Clean Architecture...
        目前的進度是...
        接下來要做的是...
```

---

## 效能考量

### Token 使用量
完整模式會載入所有文件，可能消耗較多 tokens。

**建議：**
- 如果只需要快速理解 → 使用 `--summary`
- 如果要開始開發 → 使用完整模式
- 如果只查特定資訊 → 使用 `consult-spec` 或其他針對性工具

### 快取機制
Claude Code 會自動快取已讀取的文件，所以：
- 第一次載入：消耗完整 tokens
- 後續引用：從快取讀取，幾乎不耗 tokens

---

## 輔助功能

### 檔案完整性檢查
腳本會自動檢查所有必要文件是否存在：

```
✅ docs/phase-1/1.user-story.md
✅ docs/phase-1/2.spec.md
✅ backend/phase-1/1.technical-architecture.md
✅ backend/phase-1/2.database-schema.puml
❌ backend/phase-1/3.backend-architecture.puml (missing)
✅ backend/phase-1/4.todo-list.md
✅ backend/phase-1/5.test-cases.md
✅ CLAUDE.md

⚠️ 1 file missing. Some context may be incomplete.
```

### 文件新鮮度提示
```
⚠️ Warning: Some files haven't been updated recently
   - 4.todo-list.md (last modified: 7 days ago)

💡 Consider updating TODO before starting new work
```

---

## 進階用法

### 搭配 grep 搜尋
```bash
# 載入所有文件並搜尋特定關鍵字
.claude/skills/context-loader/scripts/load.sh | grep -i "自動扣款"
```

### 匯出為單一文件
```bash
# 將所有文件合併為一個檔案，方便分享或備份
.claude/skills/context-loader/scripts/load.sh > project-context.txt
```

---

## 最佳實踐

### ✅ 應該使用 context-loader
- 開始新的開發階段
- 長時間（超過 1 週）沒碰專案
- 需要向新成員介紹專案
- Debug 複雜問題需要完整脈絡

### ⚠️ 不需要使用 context-loader
- 只是修改一個小 bug（直接看程式碼即可）
- 已經很熟悉專案結構
- 只需要查詢特定資訊（用 `consult-spec` 更高效）

---

## 文件清單

以下是 `context-loader` 會載入的完整文件清單：

| 文件 | 路徑 | 用途 |
|------|------|------|
| User Stories | `docs/phase-1/1.user-story.md` | 功能需求與驗收標準 |
| Specifications | `docs/phase-1/2.spec.md` | 詳細規格說明 |
| Technical Architecture | `backend/phase-1/1.technical-architecture.md` | 架構設計 |
| Database Schema | `backend/phase-1/2.database-schema.puml` | ER Diagram |
| Backend Architecture | `backend/phase-1/3.backend-architecture.puml` | 分層圖 |
| TODO List | `backend/phase-1/4.todo-list.md` | 開發待辦 |
| Test Cases | `backend/phase-1/5.test-cases.md` | 測試案例 |
| Project Context | `CLAUDE.md` | Coding Guidelines |

---

## 總結

**`context-loader` 是專案知識的快速載入器。**

它讓你（或 Claude）能在 30 秒內掌握：
- 📄 產品要做什麼（User Stories, Spec）
- ⚙️ 技術怎麼實作（Architecture, Schema）
- 📊 目前進度如何（TODO）
- 🧪 怎麼測試（Test Cases）

**一個指令，完整脈絡！**
