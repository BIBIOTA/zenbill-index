---
name: consult-spec
description: 查詢 ZenBill 規格書，確保開發符合設計文件。當需要確認功能需求、User Story、Spec、系統流程或開發前需要理解業務邏輯時使用。
---

# Consult Spec (查詢規格書)

## 角色定位
🎯 **PM (Product Manager)** - 確保開發內容符合產品規格

## 使用時機
- 開發新功能前需要確認需求
- 不確定某個流程的設計細節
- 需要查看 User Story 驗收標準
- 想了解某個功能的業務邏輯
- 當用戶問「接下來要做什麼？」或「這個功能應該怎麼做？」

## 執行方式

### 方法 1: 使用輔助腳本（推薦）
```bash
.claude/skills/consult-spec/scripts/search.sh "關鍵字"
```

### 方法 2: 直接查詢文件
使用 `grep` 或 `Read` 工具查詢以下文件：

## 規格書文件位置

### Phase 1 產品文件 (Traditional Chinese)
- **User Stories**: `docs/phase-1/1.user-story.md`
  - 功能需求與驗收標準
  - User Story 格式：作為...我想要...以便...

- **Specs (PRD)**: `docs/phase-1/2.spec.md`
  - 詳細規格說明
  - 資料流程與商業邏輯

- **System Flow**: `docs/phase-1/3.system-flow.puml`
  - PlantUML 時序圖
  - 系統互動流程

### Phase 1 技術文件
- **Technical Architecture**: `docs/backend/1.technical-architecture.md`
- **Database Schema**: `docs/backend/2.database-schema.puml`
- **Backend Architecture**: `docs/backend/3.backend-architecture.puml`
- **Todo List**: `docs/backend/4.todo-list.md`
- **Test Cases**: `docs/backend/5.test-cases.md`

## 常見查詢範例

| 需求 | 關鍵字 | 預期找到 |
|------|--------|---------|
| 發票同步流程 | "發票同步" / "E-Invoice" | User Story US001, API 規格 |
| 自動扣款邏輯 | "自動扣款" / "Auto-pay" | 資產生命週期流程 |
| 商家正規化 | "Rule Engine" / "正規化" | Regex 規則設計 |
| 帳戶類型 | "帳戶" / "Account" | 資產、負債帳戶定義 |
| 複式簿記 | "複式簿記" / "Double-Entry" | 借貸平衡規則 |

## 輸出格式建議
當使用此 Skill 時，請：
1. 先說明查詢目的
2. 顯示找到的規格內容（含檔案位置與行號）
3. 總結該規格對當前任務的影響

## 範例對話
```
User: 我想實作自動扣款功能
Assistant: 讓我先查詢規格書確認自動扣款的設計...
[使用 consult-spec skill]
根據 docs/phase-1/2.spec.md:125，自動扣款應該：
1. 在繳費期限前 3 天觸發
2. 從信用卡帳戶（負債）扣款到應付帳款（負債）
3. 使用複式簿記記錄...
```

## 注意事項
- 規格書為**權威來源** (Source of Truth)
- 如果實作與規格衝突，優先以規格為準
- 找不到相關規格時，應詢問用戶確認需求
