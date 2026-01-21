#!/bin/bash
# Schema Inspector - 資料庫 Schema 檢查輔助腳本

SCHEMA_FILE="backend/phase-1/2.database-schema.puml"
QUERY="$1"

if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Schema file not found: $SCHEMA_FILE"
    exit 1
fi

echo "🗄️  ZenBill Database Schema Inspector"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -z "$QUERY" ]; then
    # 顯示完整 Schema
    echo "📄 Full Database Schema (PlantUML):"
    echo ""
    cat "$SCHEMA_FILE"
else
    # 搜尋特定 table 或欄位
    echo "🔍 Searching for: \"$QUERY\""
    echo ""
    grep -n --color=always -C 5 "$QUERY" "$SCHEMA_FILE"

    if [ $? -ne 0 ]; then
        echo "❌ No matches found for: \"$QUERY\""
        echo ""
        echo "💡 Available tables:"
        echo "   - accounts (帳戶)"
        echo "   - account_types (帳戶類型)"
        echo "   - invoices (發票)"
        echo "   - invoice_items (發票明細)"
        echo "   - merchants (商家)"
        echo "   - transactions (交易)"
        echo "   - ledger_entries (分錄)"
        echo "   - normalization_rules (正規化規則)"
        exit 1
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Usage: $0 [table_name]"
echo "   Example: $0 accounts"
echo ""
echo "📖 GORM Struct Guidelines:"
echo "   - 金額欄位使用 int64 (單位：分)"
echo "   - 時間欄位使用 time.Time + autoCreateTime tag"
echo "   - JSONB 欄位使用 datatypes.JSON"
echo "   - String 欄位加上 size 限制"
echo "   - 外鍵使用 foreignKey tag"
