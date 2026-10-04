## Context

Grilling 結論（2026-10-04）。現況：Expo SDK 55、無 `expo-updates`；已有 Expo push（`pkg/pushnotification/expo.go`、
`NotificationService.Notify()`、`users.expo_push_token` 每人一個）；APK 由 pre-push hook 在 Mac mini 本機以 Gradle 打包，
**打包來源是 `app/` 的 working tree**（可能有未 commit 的改動）；正式版一律使用同一把 keystore。

## Decisions

### D1. 更新方式：在 App 內安裝 APK，不採用 expo-updates
只有一條更新路徑，原生和 JS 的改動都涵蓋，不必處理 runtimeVersion 相容。JS OTA 之後有需要再另開需求。

### D2. 「app 有沒有變」：內容雜湊
`APP_CONTENT_HASH = sha256( 依路徑排序的 (path, sha256(file)) )`，範圍：
- `app/` 中 `git ls-files -co --exclude-standard` 的檔案，排除 `android/`、`ios/`、`node_modules/`
- `packages/shared/` 同樣規則
- `pnpm-lock.yaml`

不用 git SHA 是因為打包來源包含 dirty 改動；也不在 dirty 時拒絕打包，因為 hook 在背景跑，失敗了沒人會發現。
Release 同時記錄 `app_git_sha`（app HEAD），只用於追查，不參與比對。

比對時機：在 build-apk.sh Phase 2（建 tag 之前）呼叫 `GET /app/latest-version` 取得 `content_hash`。
**查詢失敗 → 視為有變，照常打包**（寧可多發一版，也不要漏發）。

### D3. 單一事實來源：backend `app_releases`
```
app_releases
  id                          uuid PK
  version                     text      -- "1.0.57"
  version_code                int UNIQUE
  apk_url                     text
  apk_sha256                  text
  content_hash                text
  app_git_sha                 text
  min_supported_version_code  int NULL  -- 預留，目前不使用
  notified_at                 timestamptz NULL
  created_at                  timestamptz
```
「最新版」= `version_code` 最大的那筆。

### D4. Webhook：`POST /internal/app-releases`
- 驗證：header `X-Release-Secret` 以 constant-time 比對 `ZENBILL_RELEASE_WEBHOOK_SECRET`；env 沒設定時端點回 404（停用）。
- 不依賴來源 IP：請求從宿主打進 Docker 容器，看到的是 bridge gateway IP，不是 loopback；而且公開網域也轉發同一個服務。**secret 是唯一的防線**。
- 冪等：`version_code` 已存在 → 回 200，不重複推播。
- 推播：若寫入前表是空的（第一筆）→ 不推播，直接標記 `notified_at`。否則對所有 `expo_push_token != ''` 的使用者呼叫
  `Notify(APP_UPDATE, "ZenBill 有新版本", "v1.0.57 已發布，點此更新", "app_update", nil)`；完成後設定 `notified_at`。
- 推播失敗不回傳錯誤（Notify 本來就是 best-effort），webhook 只要寫入成功就回 201。

### D5. `GET /app/latest-version`（公開）
回傳 `{ version, version_code, apk_url, apk_sha256, content_hash, min_supported_version_code, released_at }`；沒有資料時回 404。
`content_hash` 是給 build-apk.sh 比對用的，不算敏感資料；`app_git_sha`、`notified_at` 不回傳。

### D6. App 端
- 目前版本：`expo-application` 的 `nativeBuildVersion`（versionCode）。
- 檢查時機：冷啟動、`AppState` 回到 `active`（最多每 30 分鐘一次）。僅限 production（`appVariant === 'production'`）。
- 提示：`latest.version_code > current` 且 `!= SecureStore/AsyncStorage 的 dismissedVersionCode` → 跳 modal（「更新」／「稍後」）；
  按「稍後」就寫入 `dismissedVersionCode`。設定頁只要有新版就常駐「有新版本 vX」入口，不受略過影響。
- 更新頁 `/app-update`：顯示版號、下載進度，按下開始。
  1. 先在 `Paths.cache` 找同版 APK，沒有就下載（`expo-file-system`）
  2. 驗證 sha256，不符就刪檔並報錯
  3. 用 `expo-intent-launcher` 以 `ACTION_VIEW`、content URI（`FileSystem.getContentUriAsync`）、`FLAG_GRANT_READ_URI_PERMISSION` 開啟安裝器
  4. 任何一步失敗 → 顯示「改用瀏覽器下載」按鈕 → `Linking.openURL(apk_url)`
- 推播 `resource_type === 'app_update'` → `router.push('/app-update')`。

### D7. build-apk.sh 流程（只限 production）
```
Phase 1.5  compute APP_CONTENT_HASH; GET latest → same hash ⇒ log "app unchanged, skip" & exit 0
Phase 2..8 (現有)
Phase 9    POST /internal/app-releases（重試 3 次，間隔 5s）；失敗只記 ERROR，exit 0
```
`scripts/notify-release.sh vX.Y.Z`：從 GitHub Release 下載 APK、算 sha256，再用同樣的 payload 呼叫 webhook。需要 `APP_CONTENT_HASH` 時現場重算（可能已漂移；只影響下次比對，可以接受）。

## Risks / Trade-offs
- 內容雜湊對任何空白變更都敏感 → 偶爾多發一版，可以接受。
- 只有 backend/root 改動時不會產生新 tag，`v*` tag 的語意變成「app 版本」。
- 第一個含更新器的版本得手動安裝（D4 的第一筆不推播）。
- 部分 OEM 的安裝器限制 → 用瀏覽器兜底。

## Implementation Notes（2026-10-04 實作後補記）
- Repository 不提供 `Count`，改由 `Create` 在同一 transaction 內（`LOCK TABLE ... SHARE ROW EXCLUSIVE` + `ON CONFLICT DO NOTHING`）回傳 `isFirst`，避免「第一筆」判斷的競態。
- Webhook 驗證比契約嚴格：`apk_sha256` 須為 64 碼 hex、`apk_url` 須為絕對 http(s) URL、`version_code > 0`；hash 一律轉小寫儲存。
- `version_code`、`min_supported_version_code` 在 DB 為 BIGINT（GORM `int`）。正式建表走 `cmd/migrate` AutoMigrate；`migrations/20261004_create_app_releases.sql` 僅供參考。
- 腳本對 400/401/404 不重試（非暫時性錯誤），只對 5xx／連線失敗重試 3 次。secret 未設定時 build-apk.sh 記 WARN 跳過；secret 從 `${ZENBILL_RELEASE_ENV_FILE:-~/.config/zenbill/release.env}` 載入。
- App 版本檢查另需 `!__DEV__` 且 `Platform.OS === 'android'`（避免本機 `expo run:android` 被視為 production）。auth guard 放行 `/app-update`。
- sha256 用 `expo-crypto` 的 `digest`，檔案以 4MB 分塊讀入（`File.bytes()` 會在 Java heap 一次配置整個 APK）。
- 更新頁的「改用瀏覽器下載」常駐顯示：使用者取消安裝或 OEM 安裝器靜默拒絕時，`startActivityAsync` 不會丟錯。
- 新增原生模組（expo-application / expo-intent-launcher / expo-crypto）→ dev client 需重新 build。
