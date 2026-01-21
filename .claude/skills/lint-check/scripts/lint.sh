#!/bin/bash
# Lint Check - 程式碼品質檢查輔助腳本

echo "🔍 Running Go Linter (golangci-lint)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 檢查是否已安裝 golangci-lint
if ! command -v golangci-lint &> /dev/null; then
    echo "❌ golangci-lint not found!"
    echo ""
    echo "📦 Please install golangci-lint:"
    echo ""
    echo "   macOS:"
    echo "   brew install golangci-lint"
    echo ""
    echo "   Linux:"
    echo "   curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b \$(go env GOPATH)/bin"
    echo ""
    echo "   Official docs: https://golangci-lint.run/usage/install/"
    exit 1
fi

# 顯示版本資訊
LINT_VERSION=$(golangci-lint version 2>&1 | head -n 1)
echo "📌 Using: $LINT_VERSION"
echo ""

# 執行 lint
golangci-lint run ./...

LINT_EXIT_CODE=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $LINT_EXIT_CODE -eq 0 ]; then
    echo "✅ Lint check passed! Code quality looks good."
    echo ""
    echo "💡 Next steps:"
    echo "   - Run tests: go test ./..."
    echo "   - Ready to commit!"
    exit 0
else
    echo "❌ Lint check failed. Please fix the issues above."
    echo ""
    echo "💡 Common fixes:"
    echo "   - Add error handling: if err != nil { return err }"
    echo "   - Add comments to exported functions"
    echo "   - Remove unused imports/variables"
    echo "   - Follow naming conventions (PascalCase for exported)"
    echo ""
    echo "📖 See ZenBill coding guidelines: cat CLAUDE.md"
    exit 1
fi
