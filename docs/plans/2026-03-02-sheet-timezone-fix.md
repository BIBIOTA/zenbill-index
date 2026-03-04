# Google Sheet 時區修正 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix timezone bug where `CreatedAt` (stored as UTC in PostgreSQL) is written to Google Sheet without converting to Asia/Taipei (UTC+8), causing timestamps to appear 8 hours early.

**Architecture:** Add a package-level `Asia/Taipei` timezone variable in `mapper.go`. Convert UTC times to local timezone before formatting, and parse sheet timestamps as local timezone.

**Tech Stack:** Go `time` package, `time.LoadLocation("Asia/Taipei")`

---

### Task 1: Write failing tests for timezone conversion

**Files:**
- Create: `backend/pkg/googlesheet/mapper_test.go`

**Step 1: Write the failing tests**

```go
package googlesheet

import (
	"testing"
	"time"

	"github.com/yukiota/zenbill/internal/domain"
)

func TestFormatChineseTimestamp_ConvertsUTCToTaipei(t *testing.T) {
	// 2026/3/1 02:58:43 UTC = 2026/3/1 10:58:43 Asia/Taipei
	utcTime := time.Date(2026, 3, 1, 2, 58, 43, 0, time.UTC)
	got := formatChineseTimestamp(utcTime)
	want := "2026/3/1 上午 10:58:43"
	if got != want {
		t.Errorf("formatChineseTimestamp(%v) = %q, want %q", utcTime, got, want)
	}
}

func TestFormatChineseTimestamp_PMTime(t *testing.T) {
	// 2026/3/1 09:47:40 UTC = 2026/3/1 17:47:40 Asia/Taipei
	utcTime := time.Date(2026, 3, 1, 9, 47, 40, 0, time.UTC)
	got := formatChineseTimestamp(utcTime)
	want := "2026/3/1 下午 5:47:40"
	if got != want {
		t.Errorf("formatChineseTimestamp(%v) = %q, want %q", utcTime, got, want)
	}
}

func TestParseSheetTimestamp_ParsesAsTaipei(t *testing.T) {
	got, err := ParseSheetTimestamp("2026/3/1 上午 10:58:43")
	if err != nil {
		t.Fatalf("ParseSheetTimestamp() error = %v", err)
	}
	// Should parse as Asia/Taipei, then internally be convertible to UTC
	wantUTC := time.Date(2026, 3, 1, 2, 58, 43, 0, time.UTC)
	if !got.UTC().Equal(wantUTC) {
		t.Errorf("ParseSheetTimestamp() UTC = %v, want %v", got.UTC(), wantUTC)
	}
}

func TestExpenseToRow_TimestampInTaipeiTimezone(t *testing.T) {
	// CreatedAt stored as UTC in DB
	utcTime := time.Date(2026, 3, 1, 2, 58, 43, 0, time.UTC)
	expense := &domain.SharedExpense{
		CreatedAt:       utcTime,
		Date:            time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC),
		Category:        "food",
		Description:     "玉里麵",
		OwnerPaidAmount: 290,
		SplitMethod:     "EQUAL",
	}
	row := ExpenseToRow(expense, []string{"Yuki"}, []string{"Partner"})
	got := row[0].(string)
	// Should contain Taipei time, not UTC
	want := "'2026/3/1 上午 10:58:43"
	if got != want {
		t.Errorf("ExpenseToRow timestamp = %q, want %q", got, want)
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./pkg/googlesheet/... -v -run "TestFormat|TestParse|TestExpenseToRow_Timestamp"`
Expected: FAIL — timestamps show UTC times instead of Taipei times

---

### Task 2: Fix timezone conversion in mapper.go

**Files:**
- Modify: `backend/pkg/googlesheet/mapper.go`

**Step 3: Add timezone variable and fix `formatChineseTimestamp`**

Add at the top of `mapper.go` (after imports):

```go
// taipeiTZ is the Asia/Taipei timezone (UTC+8) used for Google Sheet timestamps.
var taipeiTZ = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Taipei")
	if err != nil {
		// Fallback: UTC+8 fixed offset
		loc = time.FixedZone("CST", 8*60*60)
	}
	return loc
}()
```

Update `formatChineseTimestamp`:

```go
func formatChineseTimestamp(t time.Time) string {
	s := t.In(taipeiTZ).Format("2006/1/2 PM 3:04:05")
	s = strings.Replace(s, "AM", "上午", 1)
	s = strings.Replace(s, "PM", "下午", 1)
	return s
}
```

**Step 4: Fix `ParseSheetTimestamp` to parse as Taipei timezone**

```go
func ParseSheetTimestamp(s string) (time.Time, error) {
	s = strings.Replace(s, "上午", "AM", 1)
	s = strings.Replace(s, "下午", "PM", 1)
	return time.ParseInLocation("2006/1/2 PM 3:04:05", s, taipeiTZ)
}
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && go test ./pkg/googlesheet/... -v -run "TestFormat|TestParse|TestExpenseToRow_Timestamp"`
Expected: ALL PASS

**Step 6: Run all tests to verify no regressions**

Run: `cd backend && go test ./... -v`
Expected: ALL PASS

**Step 7: Commit**

```bash
cd backend
git add pkg/googlesheet/mapper.go pkg/googlesheet/mapper_test.go
git commit -m "fix(googlesheet): convert timestamps to Asia/Taipei timezone for Sheet display

CreatedAt is stored as UTC in PostgreSQL but was written to Google Sheet
without timezone conversion, causing timestamps to appear 8 hours early."
```
