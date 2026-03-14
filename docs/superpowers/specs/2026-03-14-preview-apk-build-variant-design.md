# Preview APK Build Variant Design

**Date:** 2026-03-14
**Status:** Approved

## Goal

Enable preview (staging) APK to be installed side-by-side with the production APK on the same Android device, with visual distinction between the two.

## Approach

Convert `app.json` to `app.config.ts` and use the `APP_VARIANT` environment variable (injected by EAS build profiles) to dynamically switch app name, package name, icon, and scheme.

Note: `app.config.ts` exports the config **without** the `"expo"` wrapper (unlike `app.json`). The `ExpoConfig` type represents the inner config directly.

## Configuration Matrix

| Property | Production | Preview |
|----------|-----------|---------|
| App Name | ZenBill | ZenBill Dev |
| Package Name | com.zenbill.app | com.zenbill.app.preview |
| Scheme | zenbill | zenbill-dev |
| Icon | Default icon | Icon with orange "DEV" badge |
| API URL | https://zenapi.bibiota.com/api/v1 | https://yukimac-mini.echo-mercat.ts.net:8090/api/v1 |
| Firebase Push | Enabled | Disabled (no matching google-services config) |
| `extra.appVariant` | `"production"` | `"preview"` |

## Changes

### 1. `app/app.json` → `app/app.config.ts`

Delete `app.json`. Create `app.config.ts` with dynamic configuration:

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
    bundleIdentifier: IS_PREVIEW ? "com.zenbill.app.preview" : "com.zenbill.app",
  },
  android: {
    package: IS_PREVIEW ? "com.zenbill.app.preview" : "com.zenbill.app",
    ...(IS_PREVIEW
      ? {}
      : { googleServicesFile: "./google-services.json" }),
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

### 2. `app/eas.json` Updates

Preserve existing `cli` and `submit` sections. Add `APP_VARIANT` env to `development` and `preview` profiles:

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
      "android": { "buildType": "apk" },
      "env": {
        "APP_VARIANT": "preview",
        "EXPO_PUBLIC_API_BASE_URL": "https://yukimac-mini.echo-mercat.ts.net:8090/api/v1"
      }
    },
    "production": {
      "android": { "buildType": "apk" },
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

Note: `development` profile uses `APP_VARIANT=development`, which is treated as production config (same package name `com.zenbill.app`). This is intentional — development builds use the Expo dev client and are distinguished by their runtime behavior, not package name.

### 3. Push Notification Runtime Guard

The `expo-notifications` plugin is excluded from preview builds, but app code unconditionally imports it. Add a runtime guard using `extra.enablePush`:

```typescript
// In app/_layout.tsx or lib/pushNotifications.ts
import Constants from "expo-constants";

const enablePush = Constants.expoConfig?.extra?.enablePush ?? false;

// Guard push notification registration
if (enablePush) {
  registerForPushNotifications();
}
```

For the import itself, use a dynamic import or wrap in try/catch to avoid crash when the native module is absent:

```typescript
export async function registerForPushNotifications() {
  try {
    const Notifications = await import("expo-notifications");
    // ... registration logic
  } catch {
    console.log("Push notifications not available in this build variant");
  }
}
```

### 4. Preview Icon Assets

Create preview variants of icon assets with an orange "DEV" badge overlay:
- `app/assets/icon-preview.png` (1024x1024) — main icon with DEV badge
- `app/assets/android-icon-foreground-preview.png` — adaptive icon foreground with DEV badge

### 5. Native Android Rebuild (Local Builds Only)

For local builds, regenerate `android/` directory after changing package name:
```bash
cd app
npx expo prebuild --clean --platform android
```

For EAS cloud builds, this happens automatically — no manual step needed.

## Notes

- **Firebase**: Preview build excludes `google-services.json` and `expo-notifications` plugin. Push notifications can be added later by creating a new Android app in Firebase with `com.zenbill.app.preview`.
- **Local development**: `npx expo start` is unaffected — `APP_VARIANT` is only set during EAS builds. Running `APP_VARIANT=preview npx expo start` locally will skip push notification setup but otherwise works normally.
- **development profile**: Uses `APP_VARIANT=development` but shares production package name. Dev client builds are distinguished by their runtime behavior (dev menu, hot reload), not by package name.
- **iOS**: Bundle identifier also changes for preview, but iOS builds are not the current focus.
- **TLS**: The Tailscale endpoint uses HTTPS with MagicDNS certificates, so TLS works out of the box. `usesCleartextTraffic: true` is kept for all builds to support local development scenarios.
- **Runtime variant indicator**: `extra.appVariant` can be read via `Constants.expoConfig.extra.appVariant` to display a visual banner in the app UI for testers.

## Build Commands

```bash
# Build preview APK
eas build --profile preview --platform android

# Build production APK
eas build --profile production --platform android
```
