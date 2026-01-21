#!/bin/bash
# Consult Spec - 查詢規格書輔助腳本

QUERY="$1"
DOCS_DIR="docs/phase-1"
BACKEND_DIR="backend/phase-1"

if [ -z "$QUERY" ]; then
    echo "Usage: $0 <search_query>"
    echo "Example: $0 '自動扣款'"
    exit 1
fi

echo "🔍 Searching for: \"$QUERY\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 搜尋產品文件
echo ""
echo "📄 Product Documents (docs/phase-1/):"
grep -rn --color=always -C 3 "$QUERY" "$DOCS_DIR" 2>/dev/null

# 搜尋技術文件
echo ""
echo "⚙️  Technical Documents (backend/phase-1/):"
grep -rn --color=always -C 3 "$QUERY" "$BACKEND_DIR" 2>/dev/null

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ No matches found for: \"$QUERY\""
    echo "💡 Common keywords: 發票, 帳戶, 自動扣款, 複式簿記, Rule Engine"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Search completed"
