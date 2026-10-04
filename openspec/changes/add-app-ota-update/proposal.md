## Why

App 新版只會出現在 GitHub Release（`BIBIOTA/zenbill-index`），使用者不會知道有新版，
更新時得手動找連結、下載、安裝。另外 pre-push hook 每次 push root/backend `master`
都會重打 APK 並發 Release，即使 app 完全沒變（v1.0.54–56 三天內發三版），
版號因此失去「app 有更新」的意義。

## What Changes

- **app-update**：APK 發版自動推播，並可在 App 內更新
  - `build-apk.sh`（僅 production）先算 app 建置輸入的**內容雜湊**，跟最新一筆 `app_releases` 相同就整個跳過
    （不打包、不建 tag、不發 Release、不推播）
  - 發版成功後，透過本機 webhook（`http://127.0.0.1:8091`，帶 `ZENBILL_RELEASE_WEBHOOK_SECRET`）通知 backend；
    失敗重試 3 次，仍失敗則記 ERROR，並可用 `scripts/notify-release.sh vX.Y.Z` 補發
  - Backend 新增 `app_releases` 表（`version_code` UNIQUE，預留 `min_supported_version_code`），
    寫入後以 `Notify(APP_UPDATE)` 推播給所有有 push token 的使用者（固定文案），同時寫入站內通知
  - `app_releases` 為空時的第一筆**只寫記錄、不推播**（當時沒有任何安裝版本有更新器）
  - 新增公開端點 `GET /app/latest-version`（不需登入）
  - App：開啟與回到前景時檢查版本，有新版就跳 modal；按「稍後」後同一版不再跳；設定頁常駐更新入口；
    App 內下載 APK、驗 sha256、開系統安裝器，失敗時改用瀏覽器開 APK 網址
  - 推播點擊（`resource_type=app_update`）導到更新頁
- 不納入：preview 版（無推播、套件名稱不同）、Web（站內通知中心自然顯示 `APP_UPDATE`，不另做）、
  `expo-updates` JS OTA、強制更新阻擋畫面（只預留欄位）

## Impact

- Affected specs: `specs/app-update/`
- Affected code（三個 repo）：
  - **backend/**：`migrations/`（`app_releases`）、`internal/domain/`（`AppRelease`、`NotificationTypeAppUpdate`）、
    `internal/usecase/`（`AppReleaseService`）、`internal/repository/`、`internal/delivery/http/`（webhook + latest-version）、
    `UserRepository` 新增「列出有 push token 的使用者」
  - **app/**：`app.config.ts`（`REQUEST_INSTALL_PACKAGES`、`expo-application`、`expo-intent-launcher`）、
    `lib/appUpdate.ts`、`app/_layout.tsx`（版本檢查＋`app_update` 導頁）、新增更新頁、設定頁入口
  - **root**：`scripts/build-apk.sh`（內容雜湊跳過、webhook）、新增 `scripts/notify-release.sh`、
    `packages/shared`（`AppRelease` 型別、`getLatestAppVersion`）
- Breaking changes：無。但**沒有實際變更 app 的 push 不再產生新版 APK／tag**。
- Rollout：第一個含更新器的版本必須手動安裝。
