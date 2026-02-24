# Cloudflare Turnstile Handling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the einvoice scraper reliably pass Cloudflare Turnstile challenges in Docker headless mode.

**Architecture:** Three-layer defense: (1) Stealth browser fingerprint to reduce Cloudflare trigger rate, (2) Coordinate-based Turnstile checkbox click when challenged, (3) Improved session persistence so `cf_clearance` cookies carry across syncs. The current `handleCloudflareChallenge()` is replaced with a more robust implementation.

**Tech Stack:** Go, playwright-go, Chromium headless

---

## Background & Research

Cloudflare Turnstile 的 checkbox 在 cross-domain sandboxed iframe 裡，且包裹在 Shadow DOM 中。DOM selector 方式（`input[type=checkbox]`）無法可靠地穿透。

**已驗證的可行策略（依優先順序）：**

1. **Stealth fingerprint** — 減少被 Cloudflare 偵測為 bot 的機率，可能直接跳過 Turnstile
2. **Coordinate-based click** — 截圖找到 Turnstile widget 位置，用頁面座標點擊
3. **Session reuse** — cf_clearance cookie 有效期間內不會再被挑戰

**不採用的方案：**
- Camoufox/anti-detect browser — 需要替換整個瀏覽器引擎，Go 整合困難
- 第三方 CAPTCHA solver — 增加外部依賴與成本
- OpenCV image recognition — Go 生態系支援不佳

**參考資料：**
- [Kameleo: Click Cloudflare Turnstile Checkbox](https://kameleo.io/blog/click-cloudflare-turnstile-checkbox)
- [Apify: How to Bypass Cloudflare](https://blog.apify.com/bypass-cloudflare/)
- [Browserless: Bypass Cloudflare with Playwright](https://www.browserless.io/blog/bypass-cloudflare-with-playwright)

---

### Task 1: Improve Browser Stealth Fingerprint

**Why:** Cloudflare 的 bot detection 檢查多個信號（navigator.webdriver、UA 版本、WebGL、語言等）。目前只有 `--disable-blink-features=AutomationControlled` 和固定的 Chrome/120 UA。提升指紋偽裝可以直接降低被 Turnstile 攔截的頻率。

**Files:**
- Modify: `backend/pkg/einvoice/playwright_impl.go:60-81` (NewScraper browser launch + context)

**Step 1: Update browser launch args**

在 `NewScraper()` 裡增加更多 stealth browser args：

```go
Args: []string{
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-infobars",
    "--window-size=1280,720",
    "--disable-extensions",
    "--disable-gpu",
    "--lang=zh-TW",
},
```

**Step 2: Update User-Agent to a recent Chrome version**

Chrome/120 已經過時（2023 年底）。更新為當前的 Chrome 版本：

```go
UserAgent: playwright.String("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
```

**Step 3: Add stealth JavaScript injection**

在建立 page 後，注入 anti-detection scripts：

```go
// 注入 stealth scripts（隱藏 webdriver 標記）
page.AddInitScript(playwright.Script{
    Content: playwright.String(`
        // 隱藏 navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // 偽造 plugins
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        // 偽造 languages
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW', 'zh', 'en-US', 'en'] });
        // Chrome runtime
        window.chrome = { runtime: {} };
    `),
})
```

**Step 4: Add locale to BrowserContext**

```go
context, err := browser.NewContext(playwright.BrowserNewContextOptions{
    UserAgent: playwright.String("..."),
    Locale:    playwright.String("zh-TW"),
    Viewport: &playwright.Size{Width: 1280, Height: 720},
})
```

**Step 5: Build and verify**

Run: `CGO_CPPFLAGS="..." CGO_LDFLAGS="..." go build ./...`
Expected: Compiles successfully

**Step 6: Commit**

```bash
git add backend/pkg/einvoice/playwright_impl.go
git commit -m "feat(scraper): improve browser stealth fingerprint to reduce Cloudflare detection"
```

---

### Task 2: Rewrite `handleCloudflareChallenge()` with Coordinate-Based Click

**Why:** 目前的實作嘗試用 DOM selector 在 iframe 裡找 checkbox，但 Turnstile 用 Shadow DOM 包裹，selector 無法穿透。改用 screenshot + 已知位置計算座標來點擊。

**Files:**
- Modify: `backend/pkg/einvoice/playwright_impl.go` (handleCloudflareChallenge + isCloudflareChallenge)

**Step 1: Improve `isCloudflareChallenge()` detection**

目前 `strings.Contains(title, "security")` 太寬泛（可能誤判正常頁面）。改為更精確的判斷：

```go
func (s *PlaywrightScraper) isCloudflareChallenge() bool {
    title, err := s.page.Title()
    if err != nil {
        return false
    }
    lower := strings.ToLower(title)

    // 已知的 Cloudflare 挑戰頁面標題
    if strings.Contains(lower, "just a moment") ||
        strings.Contains(lower, "attention required") {
        return true
    }

    // 更精確地檢查：頁面是否有 Turnstile iframe
    frames := s.page.Frames()
    for _, frame := range frames {
        if strings.Contains(frame.URL(), "challenges.cloudflare.com") {
            return true
        }
    }

    return false
}
```

**Step 2: Rewrite `handleCloudflareChallenge()` with coordinate-based approach**

策略：
1. 先等待看是否自動通過（managed challenge 有時會自動 pass）
2. 如果沒有自動通過，找到 Turnstile iframe 的位置
3. 用 `page.Mouse.Click()` 在 iframe 中央偏左（checkbox 的典型位置）點擊
4. 等待頁面離開挑戰頁面
5. 重試機制

```go
func (s *PlaywrightScraper) handleCloudflareChallenge(ctx context.Context) error {
    // 先等待頁面穩定
    time.Sleep(3 * time.Second)

    if !s.isCloudflareChallenge() {
        s.logger.InfoContext(ctx, "no Cloudflare challenge detected")
        return nil
    }

    s.logger.InfoContext(ctx, "Cloudflare challenge detected, attempting to solve")

    const maxRetries = 3
    for attempt := 1; attempt <= maxRetries; attempt++ {
        s.logger.InfoContext(ctx, "Cloudflare solve attempt", "attempt", attempt)

        // Phase 1: 等待自動通過（managed challenge 有時不需要點擊）
        for wait := 0; wait < 5; wait++ {
            time.Sleep(2 * time.Second)
            if !s.isCloudflareChallenge() {
                s.logger.InfoContext(ctx, "Cloudflare auto-passed", "wait_seconds", (wait+1)*2)
                time.Sleep(2 * time.Second)
                return nil
            }
        }

        // Phase 2: 嘗試找到 Turnstile iframe 並用座標點擊
        s.logger.InfoContext(ctx, "auto-pass failed, trying coordinate click")
        if err := s.clickTurnstileByCoordinate(ctx); err != nil {
            s.logger.WarnContext(ctx, "coordinate click failed", "error", err)
        }

        // Phase 3: 等待挑戰完成
        for wait := 0; wait < 10; wait++ {
            time.Sleep(2 * time.Second)
            if !s.isCloudflareChallenge() {
                s.logger.InfoContext(ctx, "Cloudflare challenge passed after click!",
                    "attempt", attempt, "wait_seconds", (wait+1)*2)
                time.Sleep(2 * time.Second)
                return nil
            }
        }

        // 重試前刷新
        if attempt < maxRetries {
            s.logger.InfoContext(ctx, "reloading for retry")
            s.page.Reload(playwright.PageReloadOptions{
                WaitUntil: playwright.WaitUntilStateDomcontentloaded,
                Timeout:   playwright.Float(float64(s.config.Timeout)),
            })
            time.Sleep(3 * time.Second)
        }
    }

    s.TakeScreenshot("/tmp/cloudflare_challenge_failed.png")
    s.logger.ErrorContext(ctx, "all Cloudflare challenge attempts exhausted")
    return ErrCloudflare
}
```

**Step 3: Implement `clickTurnstileByCoordinate()`**

使用 Playwright 的 `page.Mouse.Click()` 在 Turnstile widget 的 checkbox 位置點擊：

```go
// clickTurnstileByCoordinate 透過座標點擊 Turnstile checkbox
// Turnstile widget 通常是 300x65 的 iframe，checkbox 在左側約 (30, 33) 的位置
func (s *PlaywrightScraper) clickTurnstileByCoordinate(ctx context.Context) error {
    // 方法 1: 找到 Turnstile iframe element 的 bounding box
    turnstileLocator := s.page.Locator(
        `iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]`,
    ).First()

    box, err := turnstileLocator.BoundingBox()
    if err != nil || box == nil {
        // 方法 2: 找到 .cf-turnstile 或 #turnstile-wrapper 容器
        for _, sel := range []string{".cf-turnstile", "#turnstile-wrapper", "[data-turnstile-callback]"} {
            alt := s.page.Locator(sel).First()
            box, err = alt.BoundingBox()
            if err == nil && box != nil {
                s.logger.DebugContext(ctx, "found Turnstile container", "selector", sel)
                break
            }
        }
    }

    if box == nil {
        return fmt.Errorf("turnstile element not found on page")
    }

    s.logger.InfoContext(ctx, "found Turnstile widget",
        "x", box.X, "y", box.Y, "width", box.Width, "height", box.Height,
    )

    // Checkbox 在 iframe 左側中央，約 (28, height/2) 的位置
    clickX := box.X + 28
    clickY := box.Y + box.Height/2

    s.logger.InfoContext(ctx, "clicking Turnstile checkbox by coordinate",
        "click_x", clickX, "click_y", clickY,
    )

    // 模擬人類行為：先移動到附近，再精確點擊
    if err := s.page.Mouse().Move(clickX+20, clickY-10); err != nil {
        s.logger.WarnContext(ctx, "mouse move failed", "error", err)
    }
    time.Sleep(300 * time.Millisecond)

    if err := s.page.Mouse().Move(clickX, clickY); err != nil {
        s.logger.WarnContext(ctx, "mouse move to target failed", "error", err)
    }
    time.Sleep(200 * time.Millisecond)

    if err := s.page.Mouse().Click(clickX, clickY); err != nil {
        return fmt.Errorf("mouse click failed: %w", err)
    }

    s.logger.InfoContext(ctx, "Turnstile checkbox clicked")
    return nil
}
```

**Step 4: Build and verify**

Run: `CGO_CPPFLAGS="..." CGO_LDFLAGS="..." go build ./...`
Expected: Compiles successfully

**Step 5: Commit**

```bash
git add backend/pkg/einvoice/playwright_impl.go
git commit -m "feat(scraper): rewrite Cloudflare Turnstile handling with coordinate-based click"
```

---

### Task 3: Improve Session Persistence for `cf_clearance` Cookie

**Why:** 即使 Cloudflare 被通過一次，如果 session 沒有正確保存或載入，下次同步又會遇到挑戰。目前 `LoadSession()` 在 `NewScraper()` 的 factory 裡呼叫，但建立新 context 時沒有帶 UserAgent 和 Locale，可能導致指紋不一致而 session 無效。

**Files:**
- Modify: `backend/pkg/einvoice/playwright_impl.go` (LoadSession)

**Step 1: Fix LoadSession to preserve browser fingerprint**

目前 `LoadSession()` 用 `browser.NewContext(state)` 建立 context，但沒帶 UserAgent 和 Viewport，導致 context 的指紋與加密 session 時不同。Cloudflare 的 `cf_clearance` cookie 會綁定 UA，所以 UA 不同就無效。

```go
func (s *PlaywrightScraper) LoadSession() error {
    if _, err := os.Stat(s.config.BrowserStatePath); os.IsNotExist(err) {
        return fmt.Errorf("session file not found: %s", s.config.BrowserStatePath)
    }

    data, err := os.ReadFile(s.config.BrowserStatePath)
    if err != nil {
        return fmt.Errorf("failed to read session file: %w", err)
    }

    var storageState playwright.OptionalStorageState
    if err := json.Unmarshal(data, &storageState); err != nil {
        return fmt.Errorf("failed to parse session data: %w", err)
    }

    // 關閉現有 Context 和 Page
    if s.page != nil {
        s.page.Close()
    }
    if s.context != nil {
        s.context.Close()
    }

    // 建立新 Context，同時帶入 storage state 和 browser fingerprint
    context, err := s.browser.NewContext(playwright.BrowserNewContextOptions{
        StorageState:     &storageState,
        UserAgent:        playwright.String("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
        Locale:           playwright.String("zh-TW"),
        Viewport:         &playwright.Size{Width: 1280, Height: 720},
    })
    if err != nil {
        return fmt.Errorf("failed to create context with storage state: %w", err)
    }

    page, err := context.NewPage()
    if err != nil {
        context.Close()
        return fmt.Errorf("failed to create page: %w", err)
    }

    // 注入 stealth scripts
    page.AddInitScript(playwright.Script{
        Content: playwright.String(`
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW', 'zh', 'en-US', 'en'] });
            window.chrome = { runtime: {} };
        `),
    })

    s.context = context
    s.page = page
    return nil
}
```

**Step 2: Extract UA and stealth config as constants**

避免 UserAgent 字串在 `NewScraper` 和 `LoadSession` 重複：

```go
const (
    // BrowserUserAgent 統一的瀏覽器 User-Agent
    BrowserUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    // BrowserLocale 瀏覽器語系
    BrowserLocale = "zh-TW"

    // StealthInitScript anti-detection JavaScript
    StealthInitScript = `
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW', 'zh', 'en-US', 'en'] });
        window.chrome = { runtime: {} };
    `
)
```

**Step 3: Also save session after passing Cloudflare**

在 `handleCloudflareChallenge` 成功通過後呼叫 `SaveSession()`，確保 `cf_clearance` 被持久化：

```go
// 在 handleCloudflareChallenge 的每個 return nil 前加：
if err := s.SaveSession(); err != nil {
    s.logger.WarnContext(ctx, "failed to save session after Cloudflare pass", "error", err)
}
```

**Step 4: Build and verify**

Run: `CGO_CPPFLAGS="..." CGO_LDFLAGS="..." go build ./...`
Expected: Compiles successfully

**Step 5: Commit**

```bash
git add backend/pkg/einvoice/playwright_impl.go backend/pkg/einvoice/types.go
git commit -m "feat(scraper): improve session persistence for cf_clearance cookie reuse"
```

---

### Task 4: Integration Test — Verify End-to-End

**Why:** 確保所有變更正確整合，不會破壞現有的 scraper 流程。

**Files:**
- No new files — test via Docker container

**Step 1: Build and deploy to Docker**

```bash
# Air 會自動 hot-reload，或手動觸發
docker logs zenbill_api --tail 5
# 確認 API 已重新啟動
```

**Step 2: Clear stale error state**

```bash
docker exec zenbill_postgres psql -U zenbill -d zenbill_db \
  -c "UPDATE user_einvoice_credentials SET sync_status = 'idle', sync_error = NULL WHERE sync_status = 'error';"
```

**Step 3: Trigger sync from frontend and monitor logs**

```bash
docker logs -f zenbill_api 2>&1 | grep -E "cloudflare|Cloudflare|challenge|Turnstile|stealth|click"
```

**Step 4: Check results**

Three possible outcomes:
- **Best case:** Stealth fingerprint prevents Cloudflare trigger entirely → sync succeeds
- **Good case:** Cloudflare triggered → coordinate click passes → sync succeeds
- **Worst case:** Cloudflare Turnstile cannot be bypassed → ErrCloudflare returned

If worst case: 需要考慮 manual session bootstrap 方案（手動在本機跑一次 headless=false 取得 session）。

**Step 5: Commit if changes needed**

```bash
git add -A
git commit -m "fix(scraper): adjust Cloudflare handling based on integration test"
```

---

## Fallback: Manual Session Bootstrap (如果 Task 1-4 無法自動通過)

如果 Turnstile 仍然無法自動通過，最後手段是：

1. 在本機用 `go run cmd/manual_sync/main.go --days 1` (headless=false)
2. 手動完成 Cloudflare 驗證
3. Session 自動存到 `sessions/<user-id>/browser_state.json`
4. Docker 容器透過 volume mount 讀取 session
5. `cf_clearance` cookie 有效期間（通常數小時到一天）內不會再被挑戰

這不需要額外程式碼，現有的 session 機制已經支援。
