# Push Master 自動打包 APK 設計

**日期:** 2026-03-05
**狀態:** 已批准

## 背景

ZenBill 有一個 Expo React Native APP (`app/`)，需要在 push 到 master 時自動打包成 APK，並確保 APP 使用 production API URL (`https://zenapi.bibiota.com/api/v1`)。

## 設計

### 架構

```
git push master
  → pre-push hook (post-push-deploy.sh)
    → deploy.sh (後端 Docker 部署，現有)
    → scripts/build-apk.sh (APK 打包，新增)
```

- 使用 EAS Build 雲端打包，免費方案 30 次/月
- APK 從 Expo Dashboard 或 EAS CLI 取得下載連結

### 1. Production API URL — 修改 `app/eas.json`

在 production profile 中注入環境變數：

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://zenapi.bibiota.com/api/v1"
      }
    }
  }
}
```

Development 環境繼續使用 `.env.development` 的 `http://localhost:8090/api/v1`。

### 2. 新增 `scripts/build-apk.sh`

獨立的 APK 打包 script：
- 檢查 EAS CLI 是否已安裝
- 切到 `app/` 目錄
- 執行 `eas build --platform android --profile production --non-interactive`
- 記錄 log
- 可獨立手動執行

### 3. 修改 `scripts/post-push-deploy.sh`

在背景部署區塊中加入呼叫 `build-apk.sh`：

```bash
(
    touch "${LOCK_FILE}"
    "${DEPLOY_SCRIPT}"
    "${BUILD_APK_SCRIPT}"    # 新增
    rm -f "${LOCK_FILE}"
) >> "${LOG_FILE}" 2>&1 &
```

### 4. API 連通性

- Production API 已有 domain (`zenapi.bibiota.com`) + reverse proxy
- APP 走 HTTPS，不需額外設定
- `app.json` 的 `usesCleartextTraffic: true` 保留（開發時 localhost 需要）

### 5. 修改 `scripts/install-deploy-hooks.sh`

確保 monorepo 根目錄也安裝 hook（如果 push 從根目錄執行）。

## 修改檔案清單

| 檔案 | 動作 |
|------|------|
| `app/eas.json` | 修改 — 加入 production env |
| `scripts/build-apk.sh` | 新增 — 獨立 APK 打包 script |
| `scripts/post-push-deploy.sh` | 修改 — 加入呼叫 build-apk.sh |
| `scripts/install-deploy-hooks.sh` | 修改 — 加入 monorepo 根目錄 |
