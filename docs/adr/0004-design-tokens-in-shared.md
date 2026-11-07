# 設計 Token 放在 @zenbill/shared，Web 在啟動時注入 CSS 變數

Web 改版要對齊 App 的視覺語言（`.scratch/web-ui-redesign/spec.md`），顏色、字級、間距、圓角、陰影、版面尺寸需要一份兩端都能讀的來源。我們把 token 定義成純 TS 常數放在 `packages/shared/src/design/tokens.ts`（淺色 / 深色兩組），值與「ZenBill Design System」artifact 一致；Web 在 `main.tsx` 啟動時用 `buildTokenCss()` 產生 CSS 變數並注入 `<style id="zb-tokens">`，`index.css` 再以 Tailwind v4 `@theme inline` 把 utility（`bg-card`、`text-ink-muted`…）對到這些變數。深淺色由 `<html data-theme>` 決定，`index.html` 的 inline script 在首次繪製前依 `localStorage['zb-theme']` 與系統設定寫入，避免閃爍。

## Considered Options

**只寫在 Web 的 CSS（否決）**：最簡單，但 App 之後要對齊時得再抄一份，兩邊必然漂移；也無法對 token 本身寫測試。

**build 時產生 CSS 檔（否決）**：需要額外的 Vite plugin 或產生腳本，且產生物要 commit 或納入 build pipeline；目前只有一個消費端，成本不划算。

**shared 常數 + 執行時注入（採用）**：零 build 設定、單一來源、可用 vitest 檢查淺深兩組 key 一致；注入的字串只有約 2 KB，在 React render 前同步完成。

## Consequences

- 改 token 只改 `tokens.ts`（並同步回設計系統 artifact）；Web 不得在 CSS 中另外寫死顏色值。元件樣式（`zb-*` 類別）在 `frontend/src/styles/components.css`，只引用變數。
- `index.html` 的防閃爍 script 複製了 `resolveTheme()` 的邏輯與 storage key；兩處要一起改。
- 改版期間舊頁面透過 `index.css` 的舊變數別名（`--bg-root` → `--bg-page` 等）過渡，issue 99 上線前移除。
- App 目前仍用 `app/constants/theme.ts`；之後可直接 import 同一組 `colorTokens`（React Native 不需要 CSS 字串）。App 深色模式不在這次範圍。
