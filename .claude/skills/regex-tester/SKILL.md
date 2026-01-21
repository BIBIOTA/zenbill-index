---
name: regex-tester
description: 測試 ZenBill Rule Engine 的 Regex Pattern 是否正確匹配商家名稱。這是 ZenBill 的核心功能。在建立或修改商家正規化規則前必須使用此工具驗證。
---

# Regex Tester (正規表達式測試器)

## 角色定位
💻 **Coder (Developer)** - ZenBill Rule Engine 核心工具

## 🎯 重要性
這是 **ZenBill 最重要的 Skill**！

ZenBill 的核心價值之一是「自動清洗商家名稱」，透過 Regex 將：
- `"7-11 敦化門市"` → `"7-ELEVEN"`
- `"UBER EATS - Food"` → `"Uber Eats"`
- `"全家便利商店台北店"` → `"全家便利商店"`

**在寫入 `rule_engine.go` 之前，必須先用此工具驗證 Regex 正確性！**

## 使用時機
- **建立新規則**: 要新增商家正規化規則時
- **修改現有規則**: 要調整 Regex Pattern 時
- **Debug 規則**: 發現某些商家名稱沒被正確匹配時
- **用戶回報**: 用戶說「為什麼這個商家名稱怪怪的？」
- **批量測試**: 要驗證規則對多個變體都有效時

## 執行方式

### 方法 1: 使用 Go 測試工具（推薦）
```bash
go run .claude/skills/regex-tester/scripts/tester.go "pattern" "text"
```

### 範例
```bash
# 測試 7-11
go run .claude/skills/regex-tester/scripts/tester.go "^7-11.*" "7-11 Dunhua Store"

# 測試 Uber Eats (忽略大小寫)
go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\\s*eats" "UBER EATS - Food Delivery"

# 測試全家
go run .claude/skills/regex-tester/scripts/tester.go "全家.*" "全家便利商店 台北店"
```

## ZenBill Rule Engine 設計

### 規則格式
```go
type NormalizationRule struct {
    Pattern        string // Regex Pattern
    NormalizedName string // 正規化後的商家名稱
}
```

### 規則示例
```go
var rules = []NormalizationRule{
    {Pattern: `^7-11.*`, NormalizedName: "7-ELEVEN"},
    {Pattern: `^全家.*`, NormalizedName: "全家便利商店"},
    {Pattern: `(?i)uber\s*eats`, NormalizedName: "Uber Eats"},
    {Pattern: `(?i)starbucks`, NormalizedName: "Starbucks"},
}
```

## 常見 Regex Pattern

| 商家 | Pattern | 說明 |
|------|---------|------|
| 7-11 | `^7-11.*` | 開頭為 "7-11" |
| 全家 | `^全家.*` | 開頭為 "全家" |
| Uber Eats | `(?i)uber\s*eats` | 忽略大小寫，彈性空格 |
| Starbucks | `(?i)starbucks` | 忽略大小寫 |
| McDonald's | `(?i)mc\s*donald` | 忽略大小寫，彈性空格 |
| 特定門市 | `7-11\s+敦化` | 特定門市 |

## Regex 語法速查

### 基本符號
- `.` - 匹配任意字元
- `*` - 0 次或多次
- `+` - 1 次或多次
- `?` - 0 次或 1 次
- `^` - 字串開頭
- `$` - 字串結尾
- `\s` - 空白字元（空格、Tab）
- `\d` - 數字
- `\w` - 字母、數字、底線

### 進階語法
- `(?i)` - 忽略大小寫
- `[abc]` - 匹配 a 或 b 或 c
- `[^abc]` - 不匹配 a、b、c
- `(foo|bar)` - 匹配 foo 或 bar
- `{2,5}` - 重複 2-5 次

### 跳脫字元
特殊符號需要使用 `\` 跳脫：
- `\.` - 匹配點號
- `\(` - 匹配左括號
- `\)` - 匹配右括號
- `\$` - 匹配錢符號

## 測試流程

### 標準測試流程
1. **定義目標**: 想要匹配哪些商家名稱變體？
2. **撰寫 Pattern**: 設計 Regex
3. **使用 regex-tester 驗證**: 測試多個變體
4. **調整優化**: 根據結果修正 Pattern
5. **寫入 rule_engine.go**: 確認通過後才加入程式碼

### ✅ 完整測試範例
```bash
# 目標：匹配所有 Uber Eats 變體
# 變體：UBER EATS, Uber Eats, ubereats, UBER  EATS

# 測試 1
go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\s*eats" "UBER EATS"
# ✅ MATCH

# 測試 2
go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\s*eats" "Uber Eats"
# ✅ MATCH

# 測試 3
go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\s*eats" "ubereats"
# ✅ MATCH

# 測試 4 (多個空格)
go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\s*eats" "UBER  EATS"
# ⚠️ NO MATCH → 需要改用 \s+ 或 \s*

# 修正 Pattern
go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\s+eats" "UBER  EATS"
# ✅ MATCH
```

## 輸出解讀

### ✅ 匹配成功
```
🧪 Regex Tester for ZenBill Rule Engine
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pattern: (?i)uber\s*eats
Text:    UBER EATS - Food
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ MATCH!
   Matched: 'UBER EATS'

💡 This pattern can be added to rule_engine.go:
   {Pattern: `(?i)uber\s*eats`, NormalizedName: "Uber Eats"}
```

### ❌ 匹配失敗
```
❌ NO MATCH

💡 Tips:
   - Use (?i) for case-insensitive matching
   - Use .* to match any characters
   - Escape special chars: \. \( \)
   - Test with real invoice data for accuracy
```

## 實際應用範例

### 範例 1: 新增 7-11 規則
```
User: 幫我寫一個規則來抓 7-11
Assistant: 好的，讓我先用 regex-tester 驗證...

[測試]
go run .claude/skills/regex-tester/scripts/tester.go "^7-11.*" "7-11 Dunhua Store"

✅ 測試通過！我將把這個規則加入 rule_engine.go：
{Pattern: `^7-11.*`, NormalizedName: "7-ELEVEN"}
```

### 範例 2: 修正規則
```
User: 為什麼 "UberEats" (沒空格) 沒被匹配到？
Assistant: 讓我測試一下現有的 Pattern...

[測試]
go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber eats" "UberEats"
❌ NO MATCH

問題是 Pattern 要求必須有空格。讓我修正為 \s*（0 個或多個空格）：

go run .claude/skills/regex-tester/scripts/tester.go "(?i)uber\s*eats" "UberEats"
✅ MATCH!

已修正規則。
```

## 與其他 Skills 的配合

### 配合 consult-spec
```
我要實作 Rule Engine，先用 consult-spec 查詢規格...
[查詢規格]
規格說需要支援 7-11、全家、Uber Eats...
現在用 regex-tester 建立規則...
```

### 配合 lint-check
```
我已經用 regex-tester 驗證了所有規則，
現在把規則寫入 rule_engine.go...
[寫入程式碼]
用 lint-check 確保程式碼品質...
```

## 進階技巧

### 批量測試腳本
建立一個測試腳本來驗證多個變體：
```bash
#!/bin/bash
PATTERN="(?i)uber\s*eats"

for text in "UBER EATS" "Uber Eats" "ubereats" "uber  eats"; do
    echo "Testing: $text"
    go run .claude/skills/regex-tester/scripts/tester.go "$PATTERN" "$text"
    echo ""
done
```

### 使用真實發票資料
從 `invoices.raw_details` (JSONB) 提取真實商家名稱來測試：
```sql
SELECT DISTINCT raw_details->>'merchantName' FROM invoices LIMIT 100;
```

## 注意事項
- **先測試，後部署**: 永遠不要直接寫 Regex 到 rule_engine.go
- **測試多個變體**: 至少測試 3-5 個真實案例
- **避免過度匹配**: Pattern 太寬鬆會誤判其他商家
- **效能考量**: 複雜的 Regex 會影響效能，優先使用簡單 Pattern
- **維護文件**: 在 rule_engine.go 中註解每個規則的用途
