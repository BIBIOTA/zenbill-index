# Preview APK Build Variant Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable preview APK to install side-by-side with production on the same Android device, with visual distinction (name, icon) and separate API endpoint.

**Architecture:** Convert static `app.json` to dynamic `app.config.ts` that reads `APP_VARIANT` env var. EAS build profiles inject this variable. Push notification code gets a runtime guard to avoid crashes when the native module is absent in preview builds.

**Tech Stack:** Expo SDK 55, EAS Build, TypeScript, expo-notifications, expo-constants

**Spec:** `docs/superpowers/specs/2026-03-14-preview-apk-build-variant-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/app.json` | Delete | Replaced by `app.config.ts` |
| `app/app.config.ts` | Create | Dynamic Expo config with variant switching |
| `app/eas.json` | Modify | Add `APP_VARIANT` env vars to build profiles |
| `app/lib/pushNotifications.ts` | Modify | Add runtime guard for preview builds |
| `app/app/_layout.tsx` | Modify | Guard push notification import and registration |
| `app/assets/icon-preview.png` | Create | 1024x1024 icon with orange "DEV" badge |
| `app/assets/android-icon-foreground-preview.png` | Create | 512x512 adaptive icon foreground with "DEV" badge |

---

## Chunk 1: Config Migration and Push Notification Guard

### Task 1: Create `app.config.ts` and delete `app.json`

**Files:**
- Create: `app/app.config.ts`
- Delete: `app/app.json`

- [ ] **Step 1: Create `app/app.config.ts`**

```typescript
import { ExpoConfig, ConfigContext } from "expo/config";

const IS_PREVIEW = process.env.APP_VARIANT === "preview";

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: IS_PREVIEW ? "ZenBill Dev" : "ZenBill",
  slug: "zenbill",
  scheme: IS_PREVIEW ? "zenbill-dev" : "zenbill",
  version: "1.0.0",
  orientation: "portrait",
  icon: IS_PREVIEW ? "./assets/icon-preview.png" : "./assets/icon.png",
  userInterfaceStyle: "light",
  description: "Smart expense tracking and invoice management",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#10B981",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_PREVIEW
      ? "com.zenbill.app.preview"
      : "com.zenbill.app",
  },
  android: {
    package: IS_PREVIEW ? "com.zenbill.app.preview" : "com.zenbill.app",
    ...(IS_PREVIEW ? {} : { googleServicesFile: "./google-services.json" }),
    adaptiveIcon: {
      backgroundColor: "#ffffff",
      foregroundImage: IS_PREVIEW
        ? "./assets/android-icon-foreground-preview.png"
        : "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ...(IS_PREVIEW ? [] : ["expo-notifications"]),
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  web: {
    bundler: "metro",
    favicon: "./assets/favicon.png",
  },
  extra: {
    appVariant: IS_PREVIEW ? "preview" : "production",
    enablePush: !IS_PREVIEW,
    router: {},
    eas: {
      projectId: "c566bece-dcb6-4c32-90a5-cc42d92a434e",
    },
  },
  owner: "yukiota",
});
```

- [ ] **Step 2: Delete `app/app.json`**

```bash
rm app/app.json
```

- [ ] **Step 3: Verify config loads correctly**

```bash
cd app && npx expo config --type public
```

Expected: JSON output showing `"name": "ZenBill"`, `"slug": "zenbill"`, `"android": { "package": "com.zenbill.app" }` (production defaults since `APP_VARIANT` is not set).

- [ ] **Step 4: Verify preview variant config**

```bash
cd app && APP_VARIANT=preview npx expo config --type public
```

Expected: JSON output showing `"name": "ZenBill Dev"`, `"android": { "package": "com.zenbill.app.preview" }`, `"extra": { "appVariant": "preview", "enablePush": false }`.

- [ ] **Step 5: Commit**

```bash
git add app/app.config.ts
git rm app/app.json
git commit -m "feat(app): convert app.json to app.config.ts with variant support"
```

---

### Task 2: Update `eas.json` with `APP_VARIANT` env vars

**Files:**
- Modify: `app/eas.json`

- [ ] **Step 1: Update `eas.json`**

Replace the entire file with:

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "APP_VARIANT": "development"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "APP_VARIANT": "preview",
        "EXPO_PUBLIC_API_BASE_URL": "https://yukimac-mini.echo-mercat.ts.net:8090/api/v1"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://zenapi.bibiota.com/api/v1"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/eas.json
git commit -m "feat(app): add APP_VARIANT env to EAS build profiles"
```

---

### Task 3: Add push notification runtime guard

**Files:**
- Modify: `app/lib/pushNotifications.ts`
- Modify: `app/app/_layout.tsx`

- [ ] **Step 1: Rewrite `app/lib/pushNotifications.ts` with dynamic import guard**

The current file has a top-level `import * as Notifications from 'expo-notifications'` and a top-level call to `Notifications.setNotificationHandler()`. Both will crash on preview builds where the native module is absent.

Replace the entire file with:

```typescript
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { getApiClient } from '@zenbill/shared'

const enablePush = Constants.expoConfig?.extra?.enablePush ?? false

async function getNotificationsModule() {
  try {
    return await import('expo-notifications')
  } catch {
    return null
  }
}

export async function setupNotificationHandler(): Promise<void> {
  if (!enablePush) return
  const Notifications = await getNotificationsModule()
  if (!Notifications) return

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  })
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!enablePush) {
    console.log('Push notifications disabled for this build variant')
    return null
  }

  const Notifications = await getNotificationsModule()
  if (!Notifications) {
    console.log('Push notifications module not available')
    return null
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      })
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permission not granted')
      return null
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    })
    const token = tokenData.data
    console.log('Expo push token:', token)

    const api = getApiClient()
    await api.put('/notifications/push-token', { token })

    return token
  } catch (e) {
    console.warn('Failed to register push notifications:', e)
    return null
  }
}
```

- [ ] **Step 2: Update `app/app/_layout.tsx` to call `setupNotificationHandler`**

Add the `setupNotificationHandler` import and call it during initialization. Change the import line:

From:
```typescript
import { registerForPushNotifications } from '../lib/pushNotifications'
```

To:
```typescript
import { registerForPushNotifications, setupNotificationHandler } from '../lib/pushNotifications'
```

Add a call to `setupNotificationHandler()` in the first `useEffect` (during auth init):

From:
```typescript
useEffect(() => {
  initAuth().finally(() => {
    setReady(true)
  })
}, [])
```

To:
```typescript
useEffect(() => {
  setupNotificationHandler()
  initAuth().finally(() => {
    setReady(true)
  })
}, [])
```

- [ ] **Step 3: Verify the app starts without errors locally**

```bash
cd app && npx expo start --clear
```

Expected: App starts normally. No crash from push notification imports.

- [ ] **Step 4: Commit**

```bash
git add app/lib/pushNotifications.ts app/app/_layout.tsx
git commit -m "feat(app): add push notification runtime guard for preview builds"
```

---

## Chunk 2: Preview Icon Assets and Rebuild

### Task 4: Create preview icon assets

**Files:**
- Create: `app/assets/icon-preview.png` (1024x1024)
- Create: `app/assets/android-icon-foreground-preview.png` (512x512)

The preview icon needs an orange "DEV" badge in the top-right corner to visually distinguish it from the production icon.

- [ ] **Step 1: Generate `icon-preview.png`**

Use ImageMagick to add an orange "DEV" badge to the existing icon:

```bash
cd /Users/yuki/projects/zen-bill/app/assets

# Create a "DEV" badge overlay and composite it onto the icon
convert icon.png \
  \( -size 300x120 xc:'#FF6B00' -fill white -gravity center \
     -font Helvetica-Bold -pointsize 72 -annotate 0 "DEV" \
     -alpha on -channel A -evaluate set 90% +channel \
  \) -gravity NorthEast -geometry +40+40 -composite \
  icon-preview.png
```

If ImageMagick is not installed, manually create the icon by:
1. Opening `icon.png` in any image editor
2. Adding an orange (#FF6B00) rounded rectangle badge in the top-right corner
3. Adding white "DEV" text inside the badge
4. Saving as `icon-preview.png` at 1024x1024

- [ ] **Step 2: Generate `android-icon-foreground-preview.png`**

```bash
cd /Users/yuki/projects/zen-bill/app/assets

convert android-icon-foreground.png \
  \( -size 150x60 xc:'#FF6B00' -fill white -gravity center \
     -font Helvetica-Bold -pointsize 36 -annotate 0 "DEV" \
     -alpha on -channel A -evaluate set 90% +channel \
  \) -gravity NorthEast -geometry +20+20 -composite \
  android-icon-foreground-preview.png
```

- [ ] **Step 3: Verify both files exist and have correct dimensions**

```bash
file app/assets/icon-preview.png app/assets/android-icon-foreground-preview.png
```

Expected: `icon-preview.png` is 1024x1024 PNG, `android-icon-foreground-preview.png` is 512x512 PNG.

- [ ] **Step 4: Commit**

```bash
git add app/assets/icon-preview.png app/assets/android-icon-foreground-preview.png
git commit -m "feat(app): add preview icon assets with DEV badge"
```

---

### Task 5: Regenerate Android native project

After changing the package name config, the `android/` directory needs to be regenerated for local builds.

**Files:**
- Modify: `app/android/` (regenerated by prebuild)

- [ ] **Step 1: Run expo prebuild with clean flag**

```bash
cd app && npx expo prebuild --clean --platform android
```

Expected: `android/` directory is regenerated. No errors.

- [ ] **Step 2: Verify the generated `android/app/build.gradle` has correct package name**

```bash
grep 'namespace' app/android/app/build.gradle
```

Expected: `namespace "com.zenbill.app"` (production, since `APP_VARIANT` is not set locally).

- [ ] **Step 3: Commit regenerated Android project**

```bash
cd app && git add android/
git commit -m "chore(app): regenerate android project for app.config.ts migration"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Verify production config (no APP_VARIANT)**

```bash
cd app && npx expo config --type public 2>&1 | grep -E '"name"|"package"|"bundleIdentifier"|"appVariant"|"enablePush"'
```

Expected output includes:
- `"name": "ZenBill"`
- `"package": "com.zenbill.app"`
- `"appVariant": "production"`
- `"enablePush": true`

- [ ] **Step 2: Verify preview config**

```bash
cd app && APP_VARIANT=preview npx expo config --type public 2>&1 | grep -E '"name"|"package"|"bundleIdentifier"|"appVariant"|"enablePush"|"googleServicesFile"'
```

Expected output includes:
- `"name": "ZenBill Dev"`
- `"package": "com.zenbill.app.preview"`
- `"appVariant": "preview"`
- `"enablePush": false`
- No `googleServicesFile` line

- [ ] **Step 3: Verify app starts locally**

```bash
cd app && npx expo start --clear
```

Expected: App starts without errors. Open on device/emulator and confirm push notification code doesn't crash.

- [ ] **Step 4: (Optional) Build preview APK via EAS**

```bash
cd app && eas build --profile preview --platform android
```

Expected: Build succeeds. APK uses package name `com.zenbill.app.preview` and app name "ZenBill Dev".
