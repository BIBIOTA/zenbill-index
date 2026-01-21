#!/bin/bash
# Check Progress - 檢查開發進度輔助腳本

TODO_FILE="backend/phase-1/4.todo-list.md"
LIMIT="${1:-5}"

if [ ! -f "$TODO_FILE" ]; then
    echo "❌ Todo list not found: $TODO_FILE"
    exit 1
fi

echo "📋 ZenBill Phase-1 Progress Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 統計任務數量
TOTAL=$(grep -c "^- \[" "$TODO_FILE" 2>/dev/null || echo 0)
DONE=$(grep -c "^- \[x\]" "$TODO_FILE" 2>/dev/null || echo 0)
PENDING=$(grep -c "^- \[ \]" "$TODO_FILE" 2>/dev/null || echo 0)

# 計算完成百分比
if [ "$TOTAL" -gt 0 ]; then
    PERCENT=$((DONE * 100 / TOTAL))
else
    PERCENT=0
fi

echo "📊 Summary:"
echo "   Total:    $TOTAL tasks"
echo "   Done:     $DONE ✅"
echo "   Pending:  $PENDING ⏳"
echo "   Progress: $PERCENT%"
echo ""

if [ "$PENDING" -eq 0 ]; then
    echo "🎉 All tasks completed! Phase-1 is done!"
    echo "🚀 Ready to move to next phase."
    exit 0
fi

echo "🔜 Next $LIMIT tasks to complete:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep "^- \[ \]" "$TODO_FILE" | head -n "$LIMIT" | sed 's/^- \[ \] //' | nl -w2 -s'. '

echo ""
echo "💡 View full list: cat $TODO_FILE"
echo "💡 Start working: Choose a task and use consult-spec to check requirements"
