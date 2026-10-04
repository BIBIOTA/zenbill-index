## 0. 共用契約

- [x] 0.1 `packages/shared`：`AppRelease` 型別、`getLatestAppVersion()`（未登入也能呼叫）

## 1. Backend（backend/ repo）

- [x] 1.1 migration `app_releases`（`version_code` UNIQUE、`min_supported_version_code` NULL、`notified_at` NULL）
- [x] 1.2 Domain：`AppRelease`、`AppReleaseRepository`、`NotificationTypeAppUpdate`
- [x] 1.3 Repository：`Create`（ON CONFLICT 回報 duplicate）、`FindLatest`、`Count`、`MarkNotified`；
      `UserRepository.FindAllWithPushToken`
- [x] 1.4 Usecase `AppReleaseService.Record`：冪等、第一筆不推播、其餘逐人 `Notify(APP_UPDATE)`；單元測試涵蓋三種情境
- [x] 1.5 Handler：`POST /internal/app-releases`（secret 驗證、env 沒設定時回 404）、`GET /app/latest-version`（公開）
- [x] 1.6 Viper：`ZENBILL_RELEASE_WEBHOOK_SECRET`；**prod 只吃 env**（configs/ 沒進映像檔），記得加進 prod env 檔
- [ ] 1.7 測試全綠（repository 測試注意 port 5435）、`golangci-lint run`
      （測試＋`go vet` 已過；本機未安裝 golangci-lint，lint 未跑）

## 2. Scripts（root repo）

- [x] 2.1 `scripts/lib/app-content-hash.sh`：依 D2 計算內容雜湊
- [x] 2.2 `build-apk.sh` Phase 1.5：hash 相同就 skip；查詢失敗照常打包；preview 不受影響
- [x] 2.3 `build-apk.sh` Phase 9：算 APK sha256，POST webhook，重試 3 次，失敗記 ERROR，仍 exit 0
- [x] 2.4 `scripts/notify-release.sh vX.Y.Z`：補發用
- [x] 2.5 Mac mini 建立 `~/.config/zenbill/release.env`（`ZENBILL_RELEASE_WEBHOOK_SECRET=...`，chmod 600），
      並在 `backend/.env.prod` 加上同一個值

## 3. App（app/ repo）

- [x] 3.1 安裝 `expo-application`、`expo-intent-launcher`；`app.config.ts` 加上 `REQUEST_INSTALL_PACKAGES`
- [x] 3.2 `lib/appUpdate.ts`：檢查、略過記錄、下載＋sha256＋開啟安裝器、瀏覽器 fallback
- [x] 3.3 `_layout.tsx`：冷啟動與回到前景時檢查（節流 30 分鐘、限 production）＋modal；`app_update` 推播導頁
- [x] 3.4 `/app-update` 更新頁；設定頁「有新版本」入口
- [x] 3.5 用 `expo export` 驗證（tsc baseline 本來就壞）

## 4. 驗證與上線

- [x] 4.1 本機：手動 POST webhook → 確認第一筆不推播、第二筆會推播、重送不重複
      （2026-10-04 以臨時 DB `zenbill_ota_e2e` + scripts 函式 E2E 驗證，含只推給有 token 的使用者）
- [x] 4.2 模擬器：裝舊 versionCode → 跳 modal → 更新 → 系統安裝器；竄改 sha256 → 出現 fallback
      （2026-10-04 Pixel_7：modal、稍後不再跳、新版再跳、下載＋驗證＋安裝成功、sha 不符刪檔＋錯誤＋瀏覽器退路；推播點擊導頁未實測）
- [x] 4.3 只改 backend 並 push → 確認 deploy.log 出現 skip、沒有新 tag
      （2026-10-04 root push 實測：`app unchanged ... skipping APK build`）
- [ ] 4.4 第一個含更新器的版本手動發給使用者安裝（v1.0.57 已發布，prod 已記錄為第一筆、未推播）
