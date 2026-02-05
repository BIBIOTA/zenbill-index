#!/bin/bash
# Context Loader - 快速載入專案所有文件

MODE="${1:-full}"

echo "📚 ZenBill Context Loader"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 文件清單
PRODUCT_FILES=(
    "docs/phase-1/1.user-story.md"
    "docs/phase-1/2.spec.md"
)

TECH_FILES=(
    "docs/backend/1.technical-architecture.md"
    "docs/backend/2.database-schema.puml"
    "docs/backend/3.backend-architecture.puml"
    "docs/backend/4.todo-list.md"
    "docs/backend/5.test-cases.md"
)

PROJECT_FILES=(
    "CLAUDE.md"
)

# 檢查模式
if [ "$MODE" == "--help" ]; then
    echo "Usage: $0 [mode]"
    echo ""
    echo "Modes:"
    echo "  (no arg)          Full mode - load all files completely"
    echo "  --summary         Summary mode - show first 20 lines of each file"
    echo "  --product-only    Load only product documents"
    echo "  --tech-only       Load only technical documents"
    echo "  --todo-only       Load only TODO list"
    echo "  --help            Show this help"
    echo ""
    exit 0
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 檔案完整性檢查
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

check_files() {
    local missing=0

    echo "🔍 Checking file integrity..."
    echo ""

    for file in "${PRODUCT_FILES[@]}" "${TECH_FILES[@]}" "${PROJECT_FILES[@]}"; do
        if [ -f "$file" ]; then
            echo "✅ $file"
        else
            echo "❌ $file (missing)"
            ((missing++))
        fi
    done

    echo ""
    if [ $missing -gt 0 ]; then
        echo "⚠️  $missing file(s) missing. Some context may be incomplete."
        echo ""
    else
        echo "✅ All files present!"
        echo ""
    fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 載入函數
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

load_file_full() {
    local file=$1

    if [ ! -f "$file" ]; then
        echo "❌ File not found: $file"
        return
    fi

    echo "📖 File: $file"
    echo "────────────────────────────────────────"
    echo ""
    cat "$file"
    echo ""
    echo ""
}

load_file_summary() {
    local file=$1

    if [ ! -f "$file" ]; then
        echo "❌ $file (not found)"
        return
    fi

    local size=$(du -h "$file" | cut -f1)
    local modified=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d'.' -f1)

    echo "📖 $(basename $file)"
    echo "   Size: $size"
    echo "   Modified: $modified"
    echo "   Preview:"
    head -n 20 "$file" | sed 's/^/   /'
    echo "   [showing first 20 lines]"
    echo ""
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 主要載入邏輯
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ "$MODE" == "--summary" ]; then
    echo "Loading project documentation (Summary Mode)..."
    echo ""
    check_files

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📄 PRODUCT LAYER"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    for file in "${PRODUCT_FILES[@]}"; do
        load_file_summary "$file"
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚙️  TECHNICAL LAYER"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    for file in "${TECH_FILES[@]}"; do
        load_file_summary "$file"
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 PROJECT CONFIGURATION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    for file in "${PROJECT_FILES[@]}"; do
        load_file_summary "$file"
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 SUMMARY"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    total_files=$((${#PRODUCT_FILES[@]} + ${#TECH_FILES[@]} + ${#PROJECT_FILES[@]}))
    echo "Total files: $total_files"
    echo ""
    echo "💡 Use without --summary flag to see complete content"

elif [ "$MODE" == "--product-only" ]; then
    echo "Loading product documents..."
    echo ""

    for file in "${PRODUCT_FILES[@]}"; do
        load_file_full "$file"
    done

elif [ "$MODE" == "--tech-only" ]; then
    echo "Loading technical documents..."
    echo ""

    for file in "${TECH_FILES[@]}"; do
        load_file_full "$file"
    done

elif [ "$MODE" == "--todo-only" ]; then
    echo "Loading TODO list..."
    echo ""
    load_file_full "docs/backend/4.todo-list.md"

else
    # Full mode
    echo "Loading all project documentation..."
    echo ""
    check_files

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📄 PRODUCT LAYER"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    for file in "${PRODUCT_FILES[@]}"; do
        load_file_full "$file"
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚙️  TECHNICAL LAYER"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    for file in "${TECH_FILES[@]}"; do
        load_file_full "$file"
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 PROJECT CONFIGURATION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    for file in "${PROJECT_FILES[@]}"; do
        load_file_full "$file"
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 CONTEXT LOADING COMPLETE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    total_files=$((${#PRODUCT_FILES[@]} + ${#TECH_FILES[@]} + ${#PROJECT_FILES[@]}))
    echo "✅ Loaded $total_files files"
    echo ""
    echo "💡 You now have full context of ZenBill project!"
    echo ""
    echo "🔜 Next steps:"
    echo "   - Start a new feature: use start-feature skill"
    echo "   - Search for specific info: use consult-spec skill"
    echo "   - Check progress: use check-progress skill"
fi
