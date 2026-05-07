# Custom Split Dynamic Calculation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add smart defaults and real-time linked calculation to the CUSTOM split method in the shared expense form.

**Architecture:** Pure frontend change. Add helper functions and modify event handlers in SharedExpenseFormPage.tsx to support: (1) auto-populating equal split on CUSTOM selection, (2) linked calculation when either share field changes, (3) proportional recalculation when total amount changes, (4) clamping to [0, totalAmount].

**Tech Stack:** React (useState), TypeScript

---

### Task 1: Add helper functions and update split method selection handler

**Files:**
- Modify: `frontend/src/pages/SharedExpenseFormPage.tsx:1-43`

**Step 1: Add helper functions after the `splitOptions` constant (line 24)**

After line 24 (`]`), insert:

```tsx
/** Round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Clamp value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Calculate equal split: owner gets floor, partner gets remainder */
function equalSplit(total: number): [string, string] {
  const owner = Math.floor(total / 2 * 100) / 100
  const partner = round2(total - owner)
  return [String(owner), String(partner)]
}
```

**Step 2: Update the split method button's onClick handler**

Replace line 222:
```tsx
onClick={() => setSplitMethod(opt.value)}
```

With:
```tsx
onClick={() => {
  setSplitMethod(opt.value)
  if (opt.value === 'CUSTOM') {
    const total = parseFloat(amount) || 0
    const [o, p] = equalSplit(total)
    setOwnerAmount(o)
    setPartnerAmount(p)
  }
}}
```

**Step 3: Verify the app compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/pages/SharedExpenseFormPage.tsx
git commit -m "feat(frontend): add default equal split when selecting CUSTOM method"
```

---

### Task 2: Add linked calculation on share field changes

**Files:**
- Modify: `frontend/src/pages/SharedExpenseFormPage.tsx:242-264` (the two custom amount inputs)

**Step 1: Replace ownerAmount input's onChange (line 245)**

Replace:
```tsx
onChange={(e) => setOwnerAmount(e.target.value)}
```

With:
```tsx
onChange={(e) => {
  const total = parseFloat(amount) || 0
  const raw = parseFloat(e.target.value)
  if (isNaN(raw)) {
    setOwnerAmount(e.target.value)
    setPartnerAmount(String(total))
    return
  }
  const clamped = clamp(raw, 0, total)
  setOwnerAmount(String(clamped))
  setPartnerAmount(String(round2(total - clamped)))
}}
```

**Step 2: Replace partnerAmount input's onChange (line 259)**

Replace:
```tsx
onChange={(e) => setPartnerAmount(e.target.value)}
```

With:
```tsx
onChange={(e) => {
  const total = parseFloat(amount) || 0
  const raw = parseFloat(e.target.value)
  if (isNaN(raw)) {
    setPartnerAmount(e.target.value)
    setOwnerAmount(String(total))
    return
  }
  const clamped = clamp(raw, 0, total)
  setPartnerAmount(String(clamped))
  setOwnerAmount(String(round2(total - clamped)))
}}
```

**Step 3: Verify the app compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/pages/SharedExpenseFormPage.tsx
git commit -m "feat(frontend): add linked calculation between custom split fields"
```

---

### Task 3: Add proportional recalculation when total amount changes

**Files:**
- Modify: `frontend/src/pages/SharedExpenseFormPage.tsx:191` (amount input's onChange)

**Step 1: Replace the amount input's onChange (line 191)**

Replace:
```tsx
onChange={(e) => setAmount(e.target.value)}
```

With:
```tsx
onChange={(e) => {
  const newAmountStr = e.target.value
  if (splitMethod === 'CUSTOM') {
    const oldTotal = parseFloat(amount) || 0
    const newTotal = parseFloat(newAmountStr) || 0
    if (oldTotal > 0 && newTotal > 0) {
      const ratio = parseFloat(ownerAmount) / oldTotal
      const newOwner = round2(newTotal * ratio)
      setOwnerAmount(String(clamp(newOwner, 0, newTotal)))
      setPartnerAmount(String(round2(newTotal - clamp(newOwner, 0, newTotal))))
    } else {
      const [o, p] = equalSplit(newTotal)
      setOwnerAmount(o)
      setPartnerAmount(p)
    }
  }
  setAmount(newAmountStr)
}}
```

**Step 2: Verify the app compiles**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/SharedExpenseFormPage.tsx
git commit -m "feat(frontend): recalculate custom split proportionally on total amount change"
```

---

### Task 4: Manual browser testing

**Step 1: Start the dev server (if not running)**

Run: `cd /Users/yuki/projects/zen-bill/frontend && npm run dev`

**Step 2: Navigate to shared expense form**

Open a shared ledger → "新增支出" → fill in an amount (e.g., 500)

**Step 3: Test scenarios**

| Action | Expected |
|--------|----------|
| Select "自訂金額" | Owner = 250, Partner = 250 |
| Change owner to 300 | Partner auto-updates to 200 |
| Change partner to 100 | Owner auto-updates to 400 |
| Enter 600 in owner | Clamped to 500, partner = 0 |
| Enter -10 in owner | Clamped to 0, partner = 500 |
| Change total from 500 to 1000 (with 300/200 split) | Owner ≈ 600, Partner ≈ 400 (60/40 ratio preserved) |
| Set total to 0 | Both fields show 0 |
| Switch from EQUAL to CUSTOM | Fields pre-fill with equal split |

**Step 4: Final commit (if any fixes needed)**

```bash
git add frontend/src/pages/SharedExpenseFormPage.tsx
git commit -m "fix(frontend): adjust custom split edge cases"
```
