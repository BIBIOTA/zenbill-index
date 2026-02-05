#!/bin/bash
# Verify and Close - 驗證與收尾自動化腳本

MODE="${1:-full}"

echo "🔍 ZenBill Verification & Closure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILED=false

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Part 1: Verification
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ "$MODE" != "--skip-tests" ]; then
    echo "🧪 Part 1: Verification"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Step 1: Lint Check
    echo "Step 1/4: Lint Check"
    echo "[執行] golangci-lint run ./..."

    if command -v golangci-lint &> /dev/null; then
        golangci-lint run ./...
        LINT_EXIT=$?

        if [ $LINT_EXIT -eq 0 ]; then
            echo "✅ PASS - No issues found"
        else
            echo "❌ FAIL - Lint issues detected"
            FAILED=true
        fi
    else
        echo "⚠️  golangci-lint not found, skipping lint check"
        echo "💡 Install: brew install golangci-lint"
    fi
    echo ""

    # Step 2: Build Check
    echo "Step 2/4: Build Check"
    echo "[執行] go build ./..."

    go build ./...
    BUILD_EXIT=$?

    if [ $BUILD_EXIT -eq 0 ]; then
        echo "✅ PASS - Build successful"
    else
        echo "❌ FAIL - Build errors detected"
        FAILED=true
    fi
    echo ""

    # Step 3: Running Tests
    echo "Step 3/4: Running Tests"
    echo "[執行] go test ./... -v"
    echo ""

    go test ./... -v
    TEST_EXIT=$?

    echo ""
    if [ $TEST_EXIT -eq 0 ]; then
        echo "✅ PASS - All tests passed"
    else
        echo "❌ FAIL - Some tests failed"
        FAILED=true
    fi
    echo ""

    # Step 4: Coverage (optional)
    if [ "$MODE" == "--with-coverage" ]; then
        echo "Step 4/4: Coverage Report"
        echo "[執行] go test ./... -cover"
        go test ./... -cover
        echo ""
    fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Check if verification passed
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ "$FAILED" = true ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⛔ VERIFICATION FAILED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "❌ Cannot proceed to closure phase."
    echo ""
    echo "🔧 Action Required:"
    echo "   1. Fix all lint issues"
    echo "   2. Fix all build errors"
    echo "   3. Fix all failing tests"
    echo ""
    echo "💡 After fixing, run this script again:"
    echo "   $0"
    echo ""
    exit 1
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Part 2: Closure
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ "$MODE" == "--test-only" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Verification completed (test-only mode)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
fi

echo "📝 Part 2: Closure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: TODO Status
echo "Step 1: TODO Update Status"
TODO_FILE="docs/backend/4.todo-list.md"

if [ -f "$TODO_FILE" ]; then
    TOTAL=$(grep -c "^- \[" "$TODO_FILE" 2>/dev/null || echo 0)
    DONE=$(grep -c "^- \[x\]" "$TODO_FILE" 2>/dev/null || echo 0)
    PENDING=$(grep -c "^- \[ \]" "$TODO_FILE" 2>/dev/null || echo 0)

    echo "📊 Current TODO Status:"
    echo "   Total:   $TOTAL tasks"
    echo "   Done:    $DONE ✅"
    echo "   Pending: $PENDING ⏳"
    echo ""
    echo "💡 Remember to update TODO manually or use:"
    echo "   .claude/skills/check-progress/scripts/check.sh"
else
    echo "⚠️  TODO file not found: $TODO_FILE"
fi
echo ""

# Step 2: Documentation Sync Check
echo "Step 2: Documentation Sync Check"
echo "📋 Please verify if documentation needs update:"
echo ""
echo "   Database Schema:"
echo "   → If you added/modified entities: docs/backend/2.database-schema.puml"
echo ""
echo "   API Specification:"
echo "   → If you added/modified endpoints: docs/phase-1/2.spec.md"
echo ""
echo "   Architecture:"
echo "   → If you changed architecture: docs/backend/1.technical-architecture.md"
echo ""

# Step 3: Completion Report
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Feature Development Completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ All quality gates passed!"
echo ""
echo "🔜 Next Steps:"
echo "   1. Update TODO if not already done"
echo "   2. Sync documentation if needed"
echo "   3. Ready to commit!"
echo ""
echo "💡 Create commit:"
echo "   git add ."
echo "   git commit -m 'feat: <your feature description>'"
echo ""
