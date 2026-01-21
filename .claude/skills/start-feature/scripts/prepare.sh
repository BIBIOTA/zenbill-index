#!/bin/bash
# Start Feature - 準備開發環境輔助腳本
# 快速顯示與功能相關的文件，協助進入開發狀態

FEATURE_NAME="$1"

if [ -z "$FEATURE_NAME" ]; then
    echo "🚀 ZenBill Feature Development Launcher"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Usage: $0 <feature_name>"
    echo ""
    echo "Examples:"
    echo "  $0 '信用卡自動扣款'"
    echo "  $0 '發票同步排程'"
    echo "  $0 'Rule Engine'"
    echo ""
    echo "This script will display:"
    echo "  1. Relevant specifications"
    echo "  2. Database schema"
    echo "  3. Current TODO progress"
    echo "  4. Development guidelines"
    exit 1
fi

echo "🚀 Starting Feature: $FEATURE_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Phase 1: Context Loading
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "📖 Phase 1: Loading Context..."
echo ""

# 1. 搜尋相關規格
echo "1️⃣ Searching specifications for: \"$FEATURE_NAME\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SPEC_FOUND=false

if grep -rn "$FEATURE_NAME" docs/phase-1/ 2>/dev/null; then
    SPEC_FOUND=true
fi

if [ "$SPEC_FOUND" = false ]; then
    echo "⚠️  No direct match found in specifications."
    echo "💡 You may need to search with different keywords."
fi

echo ""

# 2. 顯示相關的資料表（如果有提到）
echo "2️⃣ Related Database Tables:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Check schema manually with:"
echo "   .claude/skills/schema-inspector/scripts/inspect.sh [table_name]"
echo ""

# 3. 顯示當前 TODO 進度
echo "3️⃣ Current Progress:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
.claude/skills/check-progress/scripts/check.sh 3
echo ""

# 4. 顯示開發指引
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Development Checklist (4 Phases):"
echo ""
echo "Phase 1: Context & Design ✅"
echo "  [x] Read specifications (shown above)"
echo "  [ ] Check database schema"
echo "  [ ] Create implementation plan"
echo "  [ ] Get user confirmation"
echo ""
echo "Phase 2: Implementation"
echo "  [ ] Write code following Clean Architecture"
echo "  [ ] Run lint-check"
echo "  [ ] Ensure code compiles"
echo ""
echo "Phase 3: Verification"
echo "  [ ] Read test cases"
echo "  [ ] Write unit tests"
echo "  [ ] Write integration tests"
echo "  [ ] Run all tests (MUST PASS)"
echo ""
echo "Phase 4: Closure"
echo "  [ ] Update TODO list"
echo "  [ ] Sync documentation (if changed)"
echo "  [ ] Report completion"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Ready to start development!"
echo ""
echo "💡 Next steps:"
echo "   1. Review the specifications above"
echo "   2. Check schema: .claude/skills/schema-inspector/scripts/inspect.sh"
echo "   3. Start coding in internal/"
echo "   4. Follow the 4-phase checklist"
echo ""
echo "🚀 Let's build $FEATURE_NAME!"
