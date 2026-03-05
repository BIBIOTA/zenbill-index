# 本地打包 APK + GitHub Release 設計

**日期:** 2026-03-06
**狀態:** 已批准

## 背景

EAS Build 雲端打包速度慢（排隊 + 建置 ~10-20 分鐘），改為本地 Gradle 打包（~3-5 分鐘），APK 自動上傳至 GitHub Release。

## 設計

### 架構

```
git push master
  -> pre-push hook (post-push-deploy.sh)
    -> deploy.sh (後端 Docker 部署，不變)
    -> scripts/build-apk.sh (本地 Gradle 打包)
        1. 解析 git tag -> 設定版本號
        2. npx expo prebuild --platform android --clean
        3. 注入 EXPO_PUBLIC_API_BASE_URL
        4. ./gradlew assembleRelease (簽名 APK)
        5. gh release create + upload APK
```

### 1. Keystore 管理

- 從 EAS 下載現有 keystore 或產生新的
- 存放路徑: `app/android/keystores/release.keystore` (gitignore)
- 簽名資訊透過 `~/.gradle/gradle.properties` 注入:
  ```properties
  ZENBILL_RELEASE_STORE_FILE=keystores/release.keystore
  ZENBILL_RELEASE_STORE_PASSWORD=***
  ZENBILL_RELEASE_KEY_ALIAS=***
  ZENBILL_RELEASE_KEY_PASSWORD=***
  ```
- `app/android/app/build.gradle` 中讀取這些 properties 設定 signingConfigs

### 2. 版本號 (Git Tag 驅動)

- 格式: `v1.0.3`
- `versionName` = `1.0.3` (從 tag 解析)
- `versionCode` = major*10000 + minor*100 + patch (如 `10003`)
- 無 tag 時 fallback 到 `app.json` 的 version
- build script 動態寫入 `app.json` 再 prebuild

### 3. build-apk.sh 核心流程

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. 解析 git tag
TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ "$TAG" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    VERSION_NAME="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"
    VERSION_CODE=$(( ${BASH_REMATCH[1]}*10000 + ${BASH_REMATCH[2]}*100 + ${BASH_REMATCH[3]} ))
else
    # fallback
    VERSION_NAME="1.0.0"
    VERSION_CODE=10000
fi

# 2. expo prebuild
cd app
EXPO_PUBLIC_API_BASE_URL="https://zenapi.bibiota.com/api/v1" \
  npx expo prebuild --platform android --clean

# 3. Gradle build
cd android
./gradlew assembleRelease

# 4. Upload to GitHub Release
APK_PATH="app/build/outputs/apk/release/app-release.apk"
gh release create "v${VERSION_NAME}" "$APK_PATH" \
  --title "v${VERSION_NAME}" \
  --notes "ZenBill v${VERSION_NAME} (build ${VERSION_CODE})"
```

### 4. GitHub Release

- 使用 `gh` CLI (已安裝)
- Release tag 與 git tag 一致
- APK 作為 release asset 上傳
- 如果 tag 已存在 release，使用 `gh release upload` 追加

### 5. 移除/修改 EAS 依賴

- `eas.json`: `appVersionSource` 改為 `local`
- 保留 `eas.json` (development profile 可能仍需要)
- build-apk.sh 不再呼叫 `eas build`

## 修改檔案清單

| 檔案 | 動作 |
|------|------|
| `scripts/build-apk.sh` | 重寫 -- 改為本地 Gradle + gh release |
| `app/eas.json` | 修改 -- appVersionSource 改 local |
| `.gitignore` | 修改 -- 加入 app/android/ 和 keystore |
| `app/android/` | 產生 -- expo prebuild 產出 (gitignore) |

## 前置作業 (一次性)

1. 設定 keystore (從 EAS 下載或新建)
2. 設定 `~/.gradle/gradle.properties` 簽名資訊
3. 確認 `gh` CLI 已登入且有 release 權限
4. 設定 `ANDROID_SDK_ROOT` 環境變數
