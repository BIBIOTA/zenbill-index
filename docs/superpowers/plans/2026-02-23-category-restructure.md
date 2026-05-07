# Category Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure 57 flat categories into a hierarchical parent-child tree via a one-shot SQL migration script.

**Architecture:** A standalone Go CLI tool (`backend/cmd/migrate_categories/main.go`) that connects to PostgreSQL and runs the entire restructure inside a single DB transaction. No schema changes needed — just data manipulation (INSERT, UPDATE, DELETE on `categories` table + UPDATE on `transactions` and `merchants` for FK references).

**Tech Stack:** Go, GORM (for DB connection), raw SQL (for migration logic), PostgreSQL

**Design doc:** `docs/plans/2026-02-23-category-restructure-design.md`

---

### Task 1: Create the migration CLI scaffold

**Files:**
- Create: `backend/cmd/migrate_categories/main.go`

**Step 1: Write the scaffold**

Create `backend/cmd/migrate_categories/main.go` with a `main()` function that:
1. Loads `.env` and config via `config.Load("")`
2. Connects to PostgreSQL via `database.NewPostgresDB`
3. Begins a transaction (`db.Begin()`)
4. Calls `runMigration(tx *gorm.DB) error`
5. On error: rollback + log fatal. On success: commit + log success.

Use the same pattern as `backend/cmd/migrate/main.go` for config/DB setup. The `runMigration` function should be empty for now (just `return nil`).

```go
package main

import (
	"log"

	"github.com/joho/godotenv"
	"github.com/yukiota/zenbill/internal/config"
	"github.com/yukiota/zenbill/pkg/database"
	"gorm.io/gorm"
)

func main() {
	log.Println("🔄 Starting category restructure migration...")

	if err := godotenv.Load(); err != nil {
		log.Printf("⚠️  .env not found, using environment variables")
	}

	cfg, err := config.Load("")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.NewPostgresDB(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer func() {
		if err := database.CloseDB(db); err != nil {
			log.Printf("Error closing database: %v", err)
		}
	}()

	tx := db.Begin()
	if tx.Error != nil {
		log.Fatalf("Failed to begin transaction: %v", tx.Error)
	}

	if err := runMigration(tx); err != nil {
		tx.Rollback()
		log.Fatalf("❌ Migration failed (rolled back): %v", err)
	}

	if err := tx.Commit().Error; err != nil {
		log.Fatalf("❌ Failed to commit: %v", err)
	}

	log.Println("🎉 Category restructure completed successfully!")
}

func runMigration(tx *gorm.DB) error {
	// Will be implemented in subsequent tasks
	return nil
}
```

**Step 2: Verify it compiles**

Run from `backend/`:
```bash
go build ./cmd/migrate_categories/...
```
Expected: builds successfully, no errors.

**Step 3: Commit**

```bash
git add backend/cmd/migrate_categories/main.go
git commit -m "feat: scaffold category restructure migration CLI"
```

---

### Task 2: Implement Step 1 — Merge duplicate categories (transaction + merchant migration)

**Files:**
- Modify: `backend/cmd/migrate_categories/main.go`

**Context:** Before we can delete duplicate categories, we must move their transactions and merchant references to the "surviving" category. This step handles all merges defined in the design doc.

**Step 1: Add the merge logic to `runMigration`**

Add a `mergeCategories` function that runs these SQL operations inside the transaction. The merge map is:

| Source (to be deleted) | Source ID | Target (to keep) | Target ID |
|------------------------|-----------|-------------------|-----------|
| 自動加值 | `babdbd06-23f4-4f67-adf1-be3c78871ec0` | 公共運輸 | `c985f5ef-05ce-4395-90ce-fbe8cb93ec19` |
| 門票 | `d2093c9f-9a6e-4e3c-8e76-584d7a0f4371` | 行程 | `d02802af-9d92-43f9-9f80-d0c66eca94fe` |
| 健身房 | `2445c0e6-2e26-4765-8894-8c541730c0d4` | 路跑 | `95ba09ca-18ee-47ca-8e5f-1f9dc7d0dfcd` |
| 服飾配件 | `09bfdbc1-22b8-425a-ae47-26eaf4666426` | 鞋子 | `aba38f6a-655f-46fc-8444-071d94372fa0` |
| 購物 | `13dabab3-4a22-45c7-b474-e457971fea46` | 鞋子 | `aba38f6a-655f-46fc-8444-071d94372fa0` |
| 3C | `620989d7-834b-4ddd-925b-da71ea372256` | 電子產品 | `9449972b-9c05-4d2b-9c93-24af8a97ea36` |
| 手續費 | `fc6caa7f-75d1-4b39-ad6a-f5903036bdae` | 信用卡交易手續費 | `05de666a-6848-4132-9bf8-49e73d804333` |

For each merge pair, run:
```sql
-- Move transactions
UPDATE transactions SET category_id = '<target_id>' WHERE category_id = '<source_id>';
-- Move merchant defaults
UPDATE merchants SET default_category_id = '<target_id>' WHERE default_category_id = '<source_id>';
-- Delete source category
DELETE FROM categories WHERE id = '<source_id>';
```

```go
func mergeCategories(tx *gorm.DB) error {
	merges := []struct {
		sourceName string
		sourceID   string
		targetID   string
	}{
		{"自動加值", "babdbd06-23f4-4f67-adf1-be3c78871ec0", "c985f5ef-05ce-4395-90ce-fbe8cb93ec19"},
		{"門票", "d2093c9f-9a6e-4e3c-8e76-584d7a0f4371", "d02802af-9d92-43f9-9f80-d0c66eca94fe"},
		{"健身房", "2445c0e6-2e26-4765-8894-8c541730c0d4", "95ba09ca-18ee-47ca-8e5f-1f9dc7d0dfcd"},
		{"服飾配件", "09bfdbc1-22b8-425a-ae47-26eaf4666426", "aba38f6a-655f-46fc-8444-071d94372fa0"},
		{"購物", "13dabab3-4a22-45c7-b474-e457971fea46", "aba38f6a-655f-46fc-8444-071d94372fa0"},
		{"3C", "620989d7-834b-4ddd-925b-da71ea372256", "9449972b-9c05-4d2b-9c93-24af8a97ea36"},
		{"手續費", "fc6caa7f-75d1-4b39-ad6a-f5903036bdae", "05de666a-6848-4132-9bf8-49e73d804333"},
	}

	for _, m := range merges {
		log.Printf("  Merging '%s' → target %s", m.sourceName, m.targetID)

		if err := tx.Exec("UPDATE transactions SET category_id = ? WHERE category_id = ?", m.targetID, m.sourceID).Error; err != nil {
			return fmt.Errorf("merge transactions for %s: %w", m.sourceName, err)
		}
		if err := tx.Exec("UPDATE merchants SET default_category_id = ? WHERE default_category_id = ?", m.targetID, m.sourceID).Error; err != nil {
			return fmt.Errorf("merge merchants for %s: %w", m.sourceName, err)
		}
		if err := tx.Exec("DELETE FROM categories WHERE id = ?", m.sourceID).Error; err != nil {
			return fmt.Errorf("delete merged category %s: %w", m.sourceName, err)
		}
	}

	return nil
}
```

Add `"fmt"` to imports. Call `mergeCategories(tx)` as the first step in `runMigration`.

**Step 2: Verify it compiles**

```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/migrate_categories/...
```

**Step 3: Commit**

```bash
git add backend/cmd/migrate_categories/main.go
git commit -m "feat: add category merge logic (transactions + merchants migration)"
```

---

### Task 3: Implement Step 2 — Rename surviving categories

**Files:**
- Modify: `backend/cmd/migrate_categories/main.go`

**Step 1: Add rename logic**

Add a `renameCategories` function. The rename map is:

| ID | Old Name | New Name |
|----|----------|----------|
| `ffb552c7-1fd2-4f73-ac82-fbe29992eb61` | 外出用餐 | 外食 |
| `eccde5e9-37af-4547-baa5-acb616fe7e00` | 食品 | 食品雜貨 |
| `220e462a-f828-4943-9027-050cb0fb4f15` | 餐飲: 外送 | 外送 |
| `a4b4c785-2f76-4a7b-861d-117b97b63c4f` | 火車 | 火車/高鐵 |
| `499ab647-de29-440a-bf2f-87b10489fdac` | 串流服務 | 串流 |
| `284fe6fc-158b-47ad-8e6f-27c44c40e64c` | AI服務 | AI/雲端 |
| `30f4487f-14a0-40db-aa23-2b2178b0d0dd` | APP訂閱 | 其他訂閱 |
| `1bc601cd-190b-4117-83b2-d63034d3be97` | 剪髮 | 剪髮/美容 |
| `05de666a-6848-4132-9bf8-49e73d804333` | 信用卡交易手續費 | 手續費 |
| `d4fe92c6-70a5-4be1-bbfa-bd9b05612e21` | 利息 (EXPENSE) | 利息支出 |
| `efee40e2-13b1-4fd0-869e-675292299dc0` | (轉帳) | 轉帳 |
| `9449972b-9c05-4d2b-9c93-24af8a97ea36` | 電子產品 | 3C/電子 |
| `95ba09ca-18ee-47ca-8e5f-1f9dc7d0dfcd` | 路跑 | 運動 |
| `d02802af-9d92-43f9-9f80-d0c66eca94fe` | 行程 | 行程/門票 |
| `aba38f6a-655f-46fc-8444-071d94372fa0` | 鞋子 | 服飾鞋包 |

```go
func renameCategories(tx *gorm.DB) error {
	renames := []struct {
		id      string
		oldName string
		newName string
	}{
		{"ffb552c7-1fd2-4f73-ac82-fbe29992eb61", "外出用餐", "外食"},
		{"eccde5e9-37af-4547-baa5-acb616fe7e00", "食品", "食品雜貨"},
		{"220e462a-f828-4943-9027-050cb0fb4f15", "餐飲: 外送", "外送"},
		{"a4b4c785-2f76-4a7b-861d-117b97b63c4f", "火車", "火車/高鐵"},
		{"499ab647-de29-440a-bf2f-87b10489fdac", "串流服務", "串流"},
		{"284fe6fc-158b-47ad-8e6f-27c44c40e64c", "AI服務", "AI/雲端"},
		{"30f4487f-14a0-40db-aa23-2b2178b0d0dd", "APP訂閱", "其他訂閱"},
		{"1bc601cd-190b-4117-83b2-d63034d3be97", "剪髮", "剪髮/美容"},
		{"05de666a-6848-4132-9bf8-49e73d804333", "信用卡交易手續費", "手續費"},
		{"d4fe92c6-70a5-4be1-bbfa-bd9b05612e21", "利息", "利息支出"},
		{"efee40e2-13b1-4fd0-869e-675292299dc0", "(轉帳)", "轉帳"},
		{"9449972b-9c05-4d2b-9c93-24af8a97ea36", "電子產品", "3C/電子"},
		{"95ba09ca-18ee-47ca-8e5f-1f9dc7d0dfcd", "路跑", "運動"},
		{"d02802af-9d92-43f9-9f80-d0c66eca94fe", "行程", "行程/門票"},
		{"aba38f6a-655f-46fc-8444-071d94372fa0", "鞋子", "服飾鞋包"},
	}

	for _, r := range renames {
		log.Printf("  Renaming '%s' → '%s'", r.oldName, r.newName)
		if err := tx.Exec("UPDATE categories SET name = ? WHERE id = ?", r.newName, r.id).Error; err != nil {
			return fmt.Errorf("rename %s: %w", r.oldName, err)
		}
	}

	return nil
}
```

Call `renameCategories(tx)` in `runMigration` after `mergeCategories`.

**Step 2: Verify it compiles**

```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/migrate_categories/...
```

**Step 3: Commit**

```bash
git add backend/cmd/migrate_categories/main.go
git commit -m "feat: add category rename logic"
```

---

### Task 4: Implement Step 3 — Delete empty unused categories

**Files:**
- Modify: `backend/cmd/migrate_categories/main.go`

**Step 1: Add delete logic**

Delete categories with 0 transactions and 0 merchant references that are being replaced or are unnecessary. These categories must be deleted BEFORE creating new parent categories (to avoid name conflicts like old "餐飲" vs new parent "餐飲").

Categories to delete:

| ID | Name | Reason |
|----|------|--------|
| `cb82a66c-c1bc-4d4d-a25f-72f2b595113a` | （無類別）| System uses null |
| `87161833-857e-4dfb-81f1-906cf1590ec6` | 雇主 | 0 txns, unclear |
| `54e7110d-c5bb-47a9-8669-6ddc5db1df11` | 家庭 | 0 txns |
| `aadce98d-d947-4263-bcea-26c3c7eed888` | 餐飲 | 0 txns, name conflict with new parent |
| `19bdc37a-87ed-4d1e-9c29-dd722201a5ec` | 旅遊 | 0 txns, replaced by new parent |
| `876f2132-fb0e-4e14-badb-b9e1d6de5a81` | 娛樂 | 0 txns, replaced by new parent |
| `df409fc5-dcef-45cb-9847-81709f7a9bb3` | 投資 | 0 txns, replaced by new parent |
| `3062e11b-dc5d-4cff-82fd-25fcf7bf5be5` | 生活 | 0 txns, replaced by new parent |
| `77bf8885-a42e-42ba-a362-4ef19c633ec9` | 汽車 | 0 txns |

```go
func deleteUnusedCategories(tx *gorm.DB) error {
	deletes := []struct {
		id   string
		name string
	}{
		{"cb82a66c-c1bc-4d4d-a25f-72f2b595113a", "（無類別）"},
		{"87161833-857e-4dfb-81f1-906cf1590ec6", "雇主"},
		{"54e7110d-c5bb-47a9-8669-6ddc5db1df11", "家庭"},
		{"aadce98d-d947-4263-bcea-26c3c7eed888", "餐飲"},
		{"19bdc37a-87ed-4d1e-9c29-dd722201a5ec", "旅遊"},
		{"876f2132-fb0e-4e14-badb-b9e1d6de5a81", "娛樂"},
		{"df409fc5-dcef-45cb-9847-81709f7a9bb3", "投資"},
		{"3062e11b-dc5d-4cff-82fd-25fcf7bf5be5", "生活"},
		{"77bf8885-a42e-42ba-a362-4ef19c633ec9", "汽車"},
	}

	for _, d := range deletes {
		log.Printf("  Deleting '%s'", d.name)

		// Safety check: verify no transactions or merchant references exist
		var txCount int64
		if err := tx.Raw("SELECT COUNT(*) FROM transactions WHERE category_id = ?", d.id).Scan(&txCount).Error; err != nil {
			return fmt.Errorf("check transactions for %s: %w", d.name, err)
		}
		var mCount int64
		if err := tx.Raw("SELECT COUNT(*) FROM merchants WHERE default_category_id = ?", d.id).Scan(&mCount).Error; err != nil {
			return fmt.Errorf("check merchants for %s: %w", d.name, err)
		}
		if txCount > 0 || mCount > 0 {
			return fmt.Errorf("SAFETY: category '%s' still has %d transactions and %d merchants, cannot delete", d.name, txCount, mCount)
		}

		if err := tx.Exec("DELETE FROM categories WHERE id = ?", d.id).Error; err != nil {
			return fmt.Errorf("delete %s: %w", d.name, err)
		}
	}

	return nil
}
```

Call `deleteUnusedCategories(tx)` in `runMigration` after `renameCategories`.

**Step 2: Verify it compiles**

```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/migrate_categories/...
```

**Step 3: Commit**

```bash
git add backend/cmd/migrate_categories/main.go
git commit -m "feat: add deletion of unused empty categories"
```

---

### Task 5: Implement Step 4 — Create new parent categories + set icons

**Files:**
- Modify: `backend/cmd/migrate_categories/main.go`

**Step 1: Add parent category creation + icon update**

Create new parent categories. The `user_id` is `4a7f8d30-e17f-4a1c-a18f-b711150df12d`. Use `gen_random_uuid()` for IDs.

Also update icons on existing categories that will become leaf-only parents (轉帳, 儲值, 送禮, 工作) and set icons on existing subcategories that lack them.

**New EXPENSE parent categories:**
- 餐飲 🍽️, 交通 🚗, 旅遊 ✈️, 娛樂 🎬, 購物 🛒, 訂閱服務 📱, 生活 🏠, 金融 💰, 投資 📊

**New INCOME parent categories:**
- 薪資收入 💼, 投資收入 📈, 回饋 💳

**Existing categories that need icon updates:**
- 轉帳 🔄, 儲值 💳, 送禮 🎁, 工作 💼
- 收款 📥, 其他 📦

```go
func createParentCategories(tx *gorm.DB) (map[string]string, error) {
	userID := "4a7f8d30-e17f-4a1c-a18f-b711150df12d"

	parents := []struct {
		name     string
		icon     string
		catType  string
	}{
		{"餐飲", "🍽️", "EXPENSE"},
		{"交通", "🚗", "EXPENSE"},
		{"旅遊", "✈️", "EXPENSE"},
		{"娛樂", "🎬", "EXPENSE"},
		{"購物", "🛒", "EXPENSE"},
		{"訂閱服務", "📱", "EXPENSE"},
		{"生活", "🏠", "EXPENSE"},
		{"金融", "💰", "EXPENSE"},
		{"投資", "📊", "EXPENSE"},
		{"薪資收入", "💼", "INCOME"},
		{"投資收入", "📈", "INCOME"},
		{"回饋", "💳", "INCOME"},
	}

	// Map of parent name → generated UUID (needed for Task 6)
	parentIDs := make(map[string]string)

	for _, p := range parents {
		var id string
		err := tx.Raw(
			"INSERT INTO categories (id, user_id, name, icon, type, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, NOW()) RETURNING id",
			userID, p.name, p.icon, p.catType,
		).Scan(&id).Error
		if err != nil {
			return nil, fmt.Errorf("create parent '%s': %w", p.name, err)
		}
		parentIDs[p.name] = id
		log.Printf("  Created parent '%s' (%s) → %s", p.name, p.icon, id)
	}

	// Update icons on existing standalone parents
	iconUpdates := []struct {
		id   string
		icon string
	}{
		{"efee40e2-13b1-4fd0-869e-675292299dc0", "🔄"},  // 轉帳
		{"ce9aab30-e3eb-412e-9ac0-4585ab095f84", "💳"},  // 儲值
		{"99db1db8-0559-44bc-9745-731f8cca64c9", "🎁"},  // 送禮
		{"a979db33-88b6-4cc0-9d1f-b0f82f9874b6", "💼"},  // 工作
		{"99dff9d7-de42-422f-96c2-81cc5a3315d5", "📥"},  // 收款
		{"a43b0474-ec52-410d-8687-c78df1d23f38", "📦"},  // 其他
	}

	for _, u := range iconUpdates {
		if err := tx.Exec("UPDATE categories SET icon = ? WHERE id = ?", u.icon, u.id).Error; err != nil {
			return nil, fmt.Errorf("update icon for %s: %w", u.id, err)
		}
	}

	return parentIDs, nil
}
```

Update `runMigration` to capture the `parentIDs` return value.

**Step 2: Verify it compiles**

```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/migrate_categories/...
```

**Step 3: Commit**

```bash
git add backend/cmd/migrate_categories/main.go
git commit -m "feat: create new parent categories and update icons"
```

---

### Task 6: Implement Step 5 — Set parent_id on all subcategories

**Files:**
- Modify: `backend/cmd/migrate_categories/main.go`

**Step 1: Add parent assignment logic**

Set `parent_id` on existing categories to move them under their new parent. Uses the `parentIDs` map from Task 5.

```go
func assignParents(tx *gorm.DB, parentIDs map[string]string) error {
	// EXPENSE subcategory assignments: parent_name → list of child category IDs
	assignments := []struct {
		parentName string
		childIDs   []string
	}{
		{"餐飲", []string{
			"ffb552c7-1fd2-4f73-ac82-fbe29992eb61", // 外食 (was 外出用餐)
			"eccde5e9-37af-4547-baa5-acb616fe7e00", // 食品雜貨 (was 食品)
			"220e462a-f828-4943-9027-050cb0fb4f15", // 外送 (was 餐飲: 外送)
		}},
		{"交通", []string{
			"ed631e05-2610-4aac-9f57-4f4b91f45400", // 加油
			"6b3ad012-6762-4df0-85e2-64e07b60b9e3", // 停車
			"a4b4c785-2f76-4a7b-861d-117b97b63c4f", // 火車/高鐵 (was 火車)
			"1ce3443f-bb6e-4a2e-8c6f-d56c105424d8", // 計程車
			"acf04a41-0ccb-4e09-8982-3b9af80e206d", // 租車
			"c985f5ef-05ce-4395-90ce-fbe8cb93ec19", // 公共運輸
		}},
		{"旅遊", []string{
			"967c4ac2-90e4-43e0-a4c4-d9df4aa8ba03", // 機票
			"d9256a30-4040-433b-b3b2-1f14c1f99bd6", // 住宿
			"d02802af-9d92-43f9-9f80-d0c66eca94fe", // 行程/門票 (was 行程)
		}},
		{"娛樂", []string{
			"dda54f44-e36f-4a4b-a39e-bb17f1c49de4", // 電影
			"af893a29-e4dc-4dcb-8043-a11df5f43d9f", // KTV
			"95ba09ca-18ee-47ca-8e5f-1f9dc7d0dfcd", // 運動 (was 路跑)
		}},
		{"購物", []string{
			"70418a94-5967-4465-93e5-0d22c0d1e724", // 日用品
			"aba38f6a-655f-46fc-8444-071d94372fa0", // 服飾鞋包 (was 鞋子)
			"9449972b-9c05-4d2b-9c93-24af8a97ea36", // 3C/電子 (was 電子產品)
			"a378e7ec-7a6d-4a46-b9ef-ef081138a3c9", // 書本
		}},
		{"訂閱服務", []string{
			"499ab647-de29-440a-bf2f-87b10489fdac", // 串流 (was 串流服務)
			"284fe6fc-158b-47ad-8e6f-27c44c40e64c", // AI/雲端 (was AI服務)
			"30f4487f-14a0-40db-aa23-2b2178b0d0dd", // 其他訂閱 (was APP訂閱)
		}},
		{"生活", []string{
			"d716dc21-f4aa-4cd1-8eb0-fe1fd609f510", // 便利商店
			"d9262e0d-b0e6-4b3c-93ff-85afb721dac1", // 電信費
			"3055abcb-1abd-4a5b-b7b9-ce6107785646", // 公用事業
			"1bc601cd-190b-4117-83b2-d63034d3be97", // 剪髮/美容 (was 剪髮)
			"8b2190ec-33b2-416a-90cc-2b5fd54e8889", // 醫療
			"8e570dbb-2b84-4807-93e7-cf5421fbf53a", // 保險
		}},
		{"金融", []string{
			"05de666a-6848-4132-9bf8-49e73d804333", // 手續費 (was 信用卡交易手續費)
			"d4fe92c6-70a5-4be1-bbfa-bd9b05612e21", // 利息支出 (was 利息)
		}},
		{"投資", []string{
			"dad13c86-997b-4508-b679-4a9a9c05b0ad", // 股票
		}},
		// INCOME assignments
		{"薪資收入", []string{
			"6b93dfc7-9486-4293-98ad-e0b19c9b4a82", // 薪水
		}},
		{"投資收入", []string{
			"f9ab83a2-a6a8-4a31-830e-0878f6e16377", // 股息
			"95da308f-0840-42f7-8b36-f40d06798e43", // 利息 (INCOME)
		}},
		{"回饋", []string{
			"38b4a4c0-cd4e-4374-8021-0656c8fd3d4d", // 信用卡回饋
		}},
	}

	for _, a := range assignments {
		parentID, ok := parentIDs[a.parentName]
		if !ok {
			return fmt.Errorf("parent '%s' not found in parentIDs map", a.parentName)
		}

		for _, childID := range a.childIDs {
			if err := tx.Exec("UPDATE categories SET parent_id = ? WHERE id = ?", parentID, childID).Error; err != nil {
				return fmt.Errorf("assign parent '%s' to child %s: %w", a.parentName, childID, err)
			}
		}
		log.Printf("  Assigned %d children to parent '%s'", len(a.childIDs), a.parentName)
	}

	// Fix INCOME categories: remove old parent_id for 收款 and 其他 (they become top-level)
	// 信用卡回饋 was under 收款, now moves to 回饋 (handled above)
	// 利息 INCOME was under 其他, now moves to 投資收入 (handled above)

	return nil
}
```

Call `assignParents(tx, parentIDs)` in `runMigration` after `createParentCategories`.

**Step 2: Verify it compiles**

```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/migrate_categories/...
```

**Step 3: Commit**

```bash
git add backend/cmd/migrate_categories/main.go
git commit -m "feat: assign parent_id to all subcategories"
```

---

### Task 7: Add verification and run the migration

**Files:**
- Modify: `backend/cmd/migrate_categories/main.go`

**Step 1: Add a post-migration verification function**

After all operations, verify the result is correct:

```go
func verifyMigration(tx *gorm.DB) error {
	// Check total category count
	var total int64
	if err := tx.Raw("SELECT COUNT(*) FROM categories").Scan(&total).Error; err != nil {
		return fmt.Errorf("count categories: %w", err)
	}
	log.Printf("  Total categories: %d", total)

	// Check parent categories (no parent_id)
	var parents int64
	if err := tx.Raw("SELECT COUNT(*) FROM categories WHERE parent_id IS NULL").Scan(&parents).Error; err != nil {
		return fmt.Errorf("count parents: %w", err)
	}
	log.Printf("  Parent categories: %d", parents)

	// Check subcategories
	var children int64
	if err := tx.Raw("SELECT COUNT(*) FROM categories WHERE parent_id IS NOT NULL").Scan(&children).Error; err != nil {
		return fmt.Errorf("count children: %w", err)
	}
	log.Printf("  Subcategories: %d", children)

	// Verify expected counts: 18 parents (13 EXPENSE + 5 INCOME), 30 children (26 EXPENSE + 4 INCOME)
	expectedParents := int64(18)
	expectedChildren := int64(30)

	if parents != expectedParents {
		return fmt.Errorf("expected %d parent categories, got %d", expectedParents, parents)
	}
	if children != expectedChildren {
		return fmt.Errorf("expected %d subcategories, got %d", expectedChildren, children)
	}

	// Verify no orphaned transactions (transactions pointing to deleted categories)
	var orphaned int64
	if err := tx.Raw("SELECT COUNT(*) FROM transactions t WHERE t.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = t.category_id)").Scan(&orphaned).Error; err != nil {
		return fmt.Errorf("check orphaned transactions: %w", err)
	}
	if orphaned > 0 {
		return fmt.Errorf("found %d orphaned transactions pointing to non-existent categories", orphaned)
	}

	// Verify no orphaned merchants
	var orphanedMerchants int64
	if err := tx.Raw("SELECT COUNT(*) FROM merchants m WHERE m.default_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = m.default_category_id)").Scan(&orphanedMerchants).Error; err != nil {
		return fmt.Errorf("check orphaned merchants: %w", err)
	}
	if orphanedMerchants > 0 {
		return fmt.Errorf("found %d orphaned merchants pointing to non-existent categories", orphanedMerchants)
	}

	log.Println("  ✅ All verification checks passed")
	return nil
}
```

**Step 2: Wire up the complete `runMigration` function**

```go
func runMigration(tx *gorm.DB) error {
	log.Println("Step 1: Merging duplicate categories...")
	if err := mergeCategories(tx); err != nil {
		return fmt.Errorf("step 1 (merge): %w", err)
	}

	log.Println("Step 2: Renaming categories...")
	if err := renameCategories(tx); err != nil {
		return fmt.Errorf("step 2 (rename): %w", err)
	}

	log.Println("Step 3: Deleting unused empty categories...")
	if err := deleteUnusedCategories(tx); err != nil {
		return fmt.Errorf("step 3 (delete): %w", err)
	}

	log.Println("Step 4: Creating parent categories and updating icons...")
	parentIDs, err := createParentCategories(tx)
	if err != nil {
		return fmt.Errorf("step 4 (create parents): %w", err)
	}

	log.Println("Step 5: Assigning parent_id to subcategories...")
	if err := assignParents(tx, parentIDs); err != nil {
		return fmt.Errorf("step 5 (assign parents): %w", err)
	}

	log.Println("Step 6: Verifying migration result...")
	if err := verifyMigration(tx); err != nil {
		return fmt.Errorf("step 6 (verify): %w", err)
	}

	return nil
}
```

**Step 3: Verify it compiles**

```bash
cd /Users/yuki/projects/zen-bill/backend && go build ./cmd/migrate_categories/...
```

**Step 4: Run the migration on the live database**

Execute inside the Docker container (recommended) or locally:

```bash
# Option A: Run locally (requires ZENBILL_DATABASE_HOST=localhost)
cd /Users/yuki/projects/zen-bill/backend && ZENBILL_DATABASE_HOST=localhost go run ./cmd/migrate_categories/
```

Expected output:
```
🔄 Starting category restructure migration...
Step 1: Merging duplicate categories...
  Merging '自動加值' → target c985f5ef...
  ...
Step 2: Renaming categories...
  Renaming '外出用餐' → '外食'
  ...
Step 3: Deleting unused empty categories...
  Deleting '（無類別）'
  ...
Step 4: Creating parent categories and updating icons...
  Created parent '餐飲' (🍽️) → <uuid>
  ...
Step 5: Assigning parent_id to subcategories...
  Assigned 3 children to parent '餐飲'
  ...
Step 6: Verifying migration result...
  Total categories: 48
  Parent categories: 18
  Subcategories: 30
  ✅ All verification checks passed
🎉 Category restructure completed successfully!
```

**Step 5: Verify in database**

```bash
docker exec zenbill_postgres psql -U zenbill -d zenbill_db -c "
SELECT p.name as parent, p.icon, p.type,
       COALESCE(string_agg(c.name, ', ' ORDER BY c.name), '(none)') as children
FROM categories p
LEFT JOIN categories c ON c.parent_id = p.id
WHERE p.parent_id IS NULL
GROUP BY p.id, p.name, p.icon, p.type
ORDER BY p.type, p.name;"
```

**Step 6: Commit**

```bash
git add backend/cmd/migrate_categories/main.go
git commit -m "feat: complete category restructure migration with verification"
```

---

### Task 8: Verify frontend displays correctly

**Files:** None (read-only verification)

**Step 1: Check the API response**

```bash
# Get the auth token (adjust as needed)
curl -s http://localhost:8080/api/v1/categories -H "Authorization: Bearer <token>" | jq '.[] | {name, icon, type, children: [.children[]?.name]}'
```

Verify the tree structure matches the design doc.

**Step 2: Check the frontend**

Open the ZenBill frontend categories page and verify:
- Parent categories show with icons
- Subcategories are nested correctly
- Expense/Income split is correct

**Step 3: Check the dashboard donut chart**

Navigate to dashboard and verify the CategoryDonut chart still works with the restructured data.

**Step 4: Commit final**

```bash
git add -A
git commit -m "feat: category restructure migration complete

Restructured 57 flat categories into hierarchical parent-child structure:
- 13 EXPENSE parents + 26 subcategories
- 5 INCOME parents + 4 subcategories
- Merged 7 duplicate category pairs
- Deleted 9 unused empty categories
- Migrated all transaction and merchant references"
```
