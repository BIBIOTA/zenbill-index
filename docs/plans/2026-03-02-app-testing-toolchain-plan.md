# APP Testing Toolchain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Claude Code to visually inspect and interact with the ZenBill APP via Expo Web (Playwright MCP) and Android Emulator (Maestro MCP).

**Architecture:** Dual-track testing: Expo Web for rapid UI iteration via existing Playwright/Chrome DevTools MCP; Maestro MCP Server for Android Emulator native testing. Add `testID` attributes to all interactive elements for stable E2E selectors.

**Tech Stack:** Expo, React Native, Maestro CLI, Playwright MCP, Chrome DevTools MCP

---

### Task 1: Install Maestro CLI

**Files:** None (system-level install)

**Step 1: Install Maestro**

Run:
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Expected: Maestro installed to `~/.maestro/bin/maestro`

**Step 2: Verify installation**

Run:
```bash
maestro --version
```

Expected: Version number printed (e.g., `1.39.x`)

**Step 3: Verify PATH**

Run:
```bash
which maestro
```

Expected: Path like `~/.maestro/bin/maestro`. If not found, add `export PATH="$HOME/.maestro/bin:$PATH"` to `~/.zshrc`.

---

### Task 2: Configure Maestro MCP Server for Claude Code

**Files:**
- Modify: `/Users/yuki/projects/zen-bill/.claude/settings.json`

**Step 1: Add Maestro MCP to project settings**

Update `.claude/settings.json` to:

```json
{
  "enabledPlugins": {
    "ralph-loop@claude-plugins-official": true
  },
  "mcpServers": {
    "maestro": {
      "command": "maestro",
      "args": ["mcp"]
    }
  }
}
```

**Step 2: Restart Claude Code session**

The MCP server is loaded at session start. Restart Claude Code to pick up the new config.

**Step 3: Verify MCP connection**

In the new Claude Code session, the Maestro MCP tools (`take_screenshot`, `tap_on`, `input_text`, etc.) should appear in the available tools list. Test by running:
- `maestro list-devices` (via Maestro MCP or Bash) to confirm it can see the Android Emulator.

---

### Task 3: Add testID to shared UI components (Button, Input)

**Files:**
- Modify: `app/components/ui/Button.tsx`
- Modify: `app/components/ui/Input.tsx`

**Step 1: Add testID pass-through to Button**

In `app/components/ui/Button.tsx`, add `testID` to the props interface and pass it to `TouchableOpacity`:

```tsx
interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  loading?: boolean
  disabled?: boolean
  style?: ViewStyle
  testID?: string
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style, testID }: ButtonProps) {
  const v = variantStyles[variant]

  return (
    <TouchableOpacity
      testID={testID}
      style={[...]}
      onPress={onPress}
      disabled={disabled || loading}
    >
```

**Step 2: Add testID pass-through to Input**

In `app/components/ui/Input.tsx`, the `TextInput` already spreads `...props` which includes `testID`. No change needed — but verify by checking that `TextInputProps` includes `testID` (it does, it's a built-in RN prop).

**Step 3: Verify the app still compiles**

Run:
```bash
cd /Users/yuki/projects/zen-bill/app && npx expo export --platform web --output-dir /tmp/zenbill-web-check 2>&1 | tail -5
```

Expected: No TypeScript errors. (Alternative: `npx tsc --noEmit` if tsconfig is set up.)

**Step 4: Commit**

```bash
git add app/components/ui/Button.tsx
git commit -m "feat(app): add testID prop to Button component"
```

---

### Task 4: Add testID to Login screen

**Files:**
- Modify: `app/app/(auth)/login.tsx`

**Step 1: Add testID to email input**

At line 70 (`<TextInput`), add:

```tsx
<TextInput
  testID="login_email_input"
  style={styles.input}
  placeholder="your@email.com"
  ...
```

**Step 2: Add testID to login button**

At line 80 (`<TouchableOpacity` for login), add:

```tsx
<TouchableOpacity
  testID="login_submit_button"
  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
  onPress={handleLogin}
  disabled={loading}
>
```

**Step 3: Add testID to "use different email" link**

At line 53 (`<TouchableOpacity` in sent state), add:

```tsx
<TouchableOpacity testID="login_change_email_link" style={styles.linkButton} onPress={() => setSent(false)}>
```

**Step 4: Commit**

```bash
git add app/app/\(auth\)/login.tsx
git commit -m "feat(app): add testID to login screen elements"
```

---

### Task 5: Add testID to TransactionForm

**Files:**
- Modify: `app/components/transactions/TransactionForm.tsx`

**Step 1: Add testID to type selector buttons**

At line 99, each `TouchableOpacity` in the TYPES map:

```tsx
<TouchableOpacity
  testID={`txn_type_${t.value.toLowerCase()}`}
  key={t.value}
  ...
```

This produces: `txn_type_expense`, `txn_type_income`, `txn_type_transfer`.

**Step 2: Add testID to amount input**

At line 120 (`<TextInput` for amount):

```tsx
<TextInput
  testID="txn_amount_input"
  style={{...}}
  keyboardType="decimal-pad"
  ...
```

**Step 3: Add testID to date input**

At line 133 (`<TextInput` for date):

```tsx
<TextInput
  testID="txn_date_input"
  style={{...}}
  placeholder="YYYY-MM-DD"
  ...
```

**Step 4: Add testID to pickers**

Account picker (line 148):
```tsx
<Picker testID="txn_account_picker" selectedValue={accountId} onValueChange={setAccountId}>
```

Target account picker (line 161):
```tsx
<Picker testID="txn_target_account_picker" selectedValue={targetAccountId} onValueChange={setTargetAccountId}>
```

Category picker (line 176):
```tsx
<Picker testID="txn_category_picker" selectedValue={categoryId} onValueChange={setCategoryId}>
```

Merchant picker (line 193):
```tsx
<Picker testID="txn_merchant_picker" selectedValue={merchantId} onValueChange={setMerchantId}>
```

**Step 5: Add testID to note input**

At line 205 (`<TextInput` for note):

```tsx
<TextInput
  testID="txn_note_input"
  style={{...}}
  placeholder="備註 (可選)"
  ...
```

**Step 6: Add testID to submit and delete buttons**

Submit button (line 217):
```tsx
<Button
  testID="txn_submit_button"
  title={isEdit ? '儲存修改' : '新增交易'}
  ...
```

Delete button (line 225):
```tsx
<Button
  testID="txn_delete_button"
  title="刪除交易"
  ...
```

**Step 7: Commit**

```bash
git add app/components/transactions/TransactionForm.tsx
git commit -m "feat(app): add testID to TransactionForm elements"
```

---

### Task 6: Add testID to Tab screens (Dashboard, Accounts, Invoices)

**Files:**
- Modify: `app/app/(tabs)/index.tsx` — FAB button
- Modify: `app/app/(tabs)/accounts.tsx` — account cards, FAB
- Modify: `app/app/(tabs)/invoices.tsx` — sync button, filter buttons, invoice cards
- Modify: `app/app/(tabs)/more.tsx` — menu items, logout button

**Step 1: Dashboard — add testID to FAB**

In `(tabs)/index.tsx`, find the FAB component and add:
```tsx
<FAB testID="dashboard_fab" onPress={...} />
```

Note: Check if FAB component accepts testID prop. If not, also update `app/components/ui/FAB.tsx` to pass through testID like Button.

**Step 2: Accounts — add testID to account cards and FAB**

In `(tabs)/accounts.tsx`:
```tsx
<FAB testID="accounts_fab" onPress={...} />
```

Each account card:
```tsx
<TouchableOpacity testID={`account_card_${account.id}`} ...>
```

**Step 3: Invoices — add testID to key actions**

In `(tabs)/invoices.tsx`:
```tsx
// Sync button
<Button testID="invoices_sync_button" ... />

// Status filter buttons
<TouchableOpacity testID={`invoices_filter_${status}`} ...>

// Batch action buttons
<TouchableOpacity testID="invoices_batch_process" ...>
<TouchableOpacity testID="invoices_batch_ignore" ...>
```

**Step 4: More — add testID to menu items**

In `(tabs)/more.tsx`:
```tsx
<TouchableOpacity testID="menu_merchants" ...>
<TouchableOpacity testID="menu_rules" ...>
<TouchableOpacity testID="menu_categories" ...>
<TouchableOpacity testID="menu_settings" ...>
<TouchableOpacity testID="menu_logout" ...>
```

**Step 5: Update FAB component if needed**

Check `app/components/ui/FAB.tsx`. If it doesn't accept `testID`, add it:

```tsx
interface FABProps {
  onPress: () => void
  style?: ViewStyle
  testID?: string
}

export function FAB({ onPress, style, testID }: FABProps) {
  return (
    <TouchableOpacity testID={testID} ... >
```

**Step 6: Commit**

```bash
git add app/app/\(tabs\)/ app/components/ui/FAB.tsx
git commit -m "feat(app): add testID to tab screens and FAB component"
```

---

### Task 7: Create Maestro flow directory and login test

**Files:**
- Create: `app/.maestro/login.yaml`

**Step 1: Create directory**

```bash
mkdir -p /Users/yuki/projects/zen-bill/app/.maestro
```

**Step 2: Write login flow**

Create `app/.maestro/login.yaml`:

```yaml
appId: com.zenbill.app

# For Expo Go dev mode, use openLink instead of launchApp
# - openLink: exp://127.0.0.1:8081

- launchApp:
    appId: "com.zenbill.app"

- assertVisible: "ZenBill"
- assertVisible: "Sign in with your email"

- tapOn:
    id: "login_email_input"
- inputText: "test@example.com"

- tapOn:
    id: "login_submit_button"

# In dev mode, should navigate to tabs
- assertVisible:
    text: "總覽"
    optional: true
```

**Step 3: Validate flow syntax**

Run:
```bash
maestro check-flow app/.maestro/login.yaml
```

Expected: Syntax valid (flow may not run without device, but syntax check should pass).

**Step 4: Commit**

```bash
git add app/.maestro/login.yaml
git commit -m "feat(app): add Maestro login E2E test flow"
```

---

### Task 8: Create Maestro navigation test flow

**Files:**
- Create: `app/.maestro/navigation.yaml`

**Step 1: Write navigation flow**

Create `app/.maestro/navigation.yaml`:

```yaml
appId: com.zenbill.app

- launchApp:
    appId: "com.zenbill.app"

# Assumes already logged in (or dev mode auto-login)

# Test tab navigation
- assertVisible: "總覽"

- tapOn: "帳戶"
- assertVisible: "帳戶"

- tapOn: "分帳"
- assertVisible: "分帳"

- tapOn: "發票"
- assertVisible: "發票"

- tapOn: "更多"
- assertVisible: "商家管理"
- assertVisible: "規則引擎"
- assertVisible: "分類管理"
- assertVisible: "設定"

# Navigate to sub-screens from More
- tapOn: "商家管理"
- assertVisible: "新增商家"
- back

- tapOn: "規則引擎"
- assertVisible: "新增規則"
- back

# Return to dashboard
- tapOn: "總覽"
- assertVisible: "總覽"
```

**Step 2: Validate syntax**

Run:
```bash
maestro check-flow app/.maestro/navigation.yaml
```

**Step 3: Commit**

```bash
git add app/.maestro/navigation.yaml
git commit -m "feat(app): add Maestro navigation E2E test flow"
```

---

### Task 9: Create Maestro transaction creation test flow

**Files:**
- Create: `app/.maestro/create-transaction.yaml`

**Step 1: Write flow**

Create `app/.maestro/create-transaction.yaml`:

```yaml
appId: com.zenbill.app

- launchApp:
    appId: "com.zenbill.app"

# Navigate to create transaction (FAB on dashboard)
- tapOn:
    id: "dashboard_fab"

# Should see transaction form
- assertVisible: "支出"
- assertVisible: "收入"
- assertVisible: "轉帳"

# Fill in amount
- tapOn:
    id: "txn_amount_input"
- inputText: "150"

# Fill in note
- tapOn:
    id: "txn_note_input"
- inputText: "測試交易"

# Submit (will likely fail without backend, but validates UI flow)
- tapOn:
    id: "txn_submit_button"
```

**Step 2: Validate syntax**

Run:
```bash
maestro check-flow app/.maestro/create-transaction.yaml
```

**Step 3: Commit**

```bash
git add app/.maestro/create-transaction.yaml
git commit -m "feat(app): add Maestro create-transaction E2E test flow"
```

---

### Task 10: Add .maestro to .gitignore exclusions and document usage

**Files:**
- Modify: `app/.gitignore` (if it excludes `.maestro`)
- Modify: `docs/plans/2026-03-02-app-testing-toolchain-design.md` (mark as implemented)

**Step 1: Verify .maestro is tracked by git**

Run:
```bash
cd /Users/yuki/projects/zen-bill && git status app/.maestro/
```

If files show as untracked, they're fine. If ignored, update `.gitignore`.

**Step 2: Final commit with all flows**

Ensure all `.maestro/` files are committed.

**Step 3: Verify the complete setup**

Checklist:
- [ ] `maestro --version` works
- [ ] `.claude/settings.json` has Maestro MCP config
- [ ] `Button.tsx` and `FAB.tsx` accept `testID` prop
- [ ] Login screen has `testID` on email input, submit button
- [ ] TransactionForm has `testID` on all inputs, pickers, buttons
- [ ] Tab screens have `testID` on key interactive elements
- [ ] `.maestro/login.yaml` exists and passes syntax check
- [ ] `.maestro/navigation.yaml` exists and passes syntax check
- [ ] `.maestro/create-transaction.yaml` exists and passes syntax check

---

## testID Naming Convention

All `testID` values follow this pattern: `{screen}_{element}_{type}`

| Screen | Element | testID |
|--------|---------|--------|
| login | email input | `login_email_input` |
| login | submit button | `login_submit_button` |
| login | change email link | `login_change_email_link` |
| txn form | type selector | `txn_type_expense`, `txn_type_income`, `txn_type_transfer` |
| txn form | amount | `txn_amount_input` |
| txn form | date | `txn_date_input` |
| txn form | account picker | `txn_account_picker` |
| txn form | target account | `txn_target_account_picker` |
| txn form | category picker | `txn_category_picker` |
| txn form | merchant picker | `txn_merchant_picker` |
| txn form | note | `txn_note_input` |
| txn form | submit | `txn_submit_button` |
| txn form | delete | `txn_delete_button` |
| dashboard | FAB | `dashboard_fab` |
| accounts | FAB | `accounts_fab` |
| accounts | card | `account_card_{id}` |
| invoices | sync button | `invoices_sync_button` |
| invoices | filter | `invoices_filter_{status}` |
| more | menu items | `menu_merchants`, `menu_rules`, `menu_categories`, `menu_settings`, `menu_logout` |
