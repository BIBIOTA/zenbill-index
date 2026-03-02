# APP 測試工具鏈設計：Claude Code + Expo Web + Maestro

**日期:** 2026-03-02
**目標:** 讓 Claude Code 能完整操控 ZenBill APP 的 UI，包括截圖檢查、互動測試、除錯協助

## 問題

Claude Code 目前無法「看到」或「操作」在 Android Emulator 上運行的 APP 畫面，限制了 AI 輔助 UI 開發與除錯的效率。

## 方案總覽

採用雙軌策略，依測試場景選擇最適合的工具：

| 環境 | 工具 | 用途 | Claude Code 整合方式 |
|------|------|------|---------------------|
| **Expo Web** | Playwright MCP + Chrome DevTools MCP | UI layout、樣式、互動流程 | 已有（零設定） |
| **Android Emulator** | Maestro MCP Server | Native 功能、真實裝置行為 | MCP Server 設定 |

## 軌道 1: Expo Web + Playwright MCP（已就緒）

### 概述

ZenBill APP 使用 Expo + React Native，內建支援 `expo start --web`。Claude Code 已有 Playwright MCP 和 Chrome DevTools MCP，可直接操控 Web 版 APP。

### 適用場景

- UI layout 和樣式驗證
- 導航流程測試（expo-router）
- 表單填寫與互動測試
- 響應式設計檢查
- 快速迭代 UI 開發

### 不適用場景

- Native 模組（expo-haptics、expo-secure-store）
- Deep link handling（`zenbill://` scheme）
- Native navigation transitions
- 裝置特定行為（Android back button）

### 工作流程

```
1. 啟動: npx expo start --web
2. Claude Code 使用 Playwright MCP 開啟 http://localhost:8081
3. 截圖 → 分析 UI → 點擊/填寫 → 驗證結果
```

### 限制與注意

- NativeWind 在 Web 上的行為可能與 Native 略有差異
- `react-native-gesture-handler` 部分手勢在 Web 不完全支援
- 建議為 Web 不支援的功能加上 `Platform.OS` 判斷

## 軌道 2: Android Emulator + Maestro MCP（需設定）

### 概述

[Maestro](https://maestro.dev/) 是專為 Mobile UI 測試設計的自動化框架，原生支援 React Native。官方提供 [MCP Server](https://docs.maestro.dev/get-started/maestro-mcp)，可直接與 Claude Code 整合。

### Maestro 提供的 MCP 工具

| 工具 | 用途 |
|------|------|
| `take_screenshot` | 截取裝置畫面 |
| `tap_on` | 點擊 UI 元素（支援 text、testID、accessibility label） |
| `input_text` | 輸入文字 |
| `launch_app` / `stop_app` | 控制 APP 啟動/停止 |
| `run_flow` / `run_flow_files` | 執行 YAML 自動化流程 |
| `inspect_view_hierarchy` | 檢查 UI 元素樹（類似 Chrome DevTools） |
| `list_devices` / `start_device` | 管理模擬器/實體裝置 |
| `back` | Android 返回鍵 |
| `check_flow_syntax` | 驗證 Flow 語法 |
| `query_docs` | 查詢 Maestro 文件 |

### 安裝步驟

#### 1. 安裝 Maestro CLI

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

#### 2. 設定 Claude Code MCP

在 `~/.claude/settings.json` 或專案的 `.claude/settings.json` 中加入：

```json
{
  "mcpServers": {
    "maestro": {
      "command": "maestro",
      "args": ["mcp"]
    }
  }
}
```

#### 3. 確認 Android Emulator 運行中

```bash
# 列出已連接的裝置
adb devices

# 確認 Maestro 可以偵測到
maestro list-devices
```

### APP 端準備：加入 testID

為穩定的元素選擇，關鍵 UI 元素需加上 `testID`：

```tsx
// 範例：登入畫面
<TextInput
  testID="email_input"
  placeholder="Email"
  value={email}
  onChangeText={setEmail}
/>
<Pressable testID="login_button" onPress={handleLogin}>
  <Text>登入</Text>
</Pressable>
```

Maestro Flow 中引用：

```yaml
- tapOn:
    id: "email_input"
- inputText: "user@example.com"
- tapOn:
    id: "login_button"
```

### Expo 開發模式注意事項

使用 Expo Go 時，不要用 `launchApp`，改用 `openLink`：

```yaml
# Expo Go 開發模式
- openLink: exp://127.0.0.1:8081

# EAS Development Build（有自訂 bundle ID）
- launchApp:
    appId: "com.zenbill.app"
```

### 工作流程

```
1. 啟動 Android Emulator（Android Studio）
2. 啟動 Expo: npx expo start
3. 在 Emulator 中開啟 APP
4. Claude Code 透過 Maestro MCP：
   - take_screenshot → 看到畫面
   - inspect_view_hierarchy → 了解元素結構
   - tap_on / input_text → 操作 APP
   - run_flow → 執行自動化測試
```

## E2E 測試流程檔案結構

```
zen-bill/
├── app/
│   ├── .maestro/              ← Maestro 測試流程
│   │   ├── login.yaml         ← 登入流程
│   │   ├── navigation.yaml    ← 導航測試
│   │   └── invoice-list.yaml  ← 發票列表測試
│   └── ...
```

### 範例 Flow: 登入測試

```yaml
# .maestro/login.yaml
appId: com.zenbill.app

- openLink: exp://127.0.0.1:8081
- assertVisible: "登入"
- tapOn:
    id: "email_input"
- inputText: "test@example.com"
- tapOn:
    id: "login_button"
- assertVisible: "首頁"
```

## 選擇指南

| 情境 | 使用工具 |
|------|---------|
| 快速檢查 UI 樣式 | Expo Web + Playwright MCP |
| 測試表單互動 | Expo Web + Playwright MCP |
| 測試 native 功能（haptics, secure store） | Maestro MCP |
| 測試 deep link | Maestro MCP |
| 測試 Android back button 行為 | Maestro MCP |
| CI/CD E2E 測試 | Maestro Flow files |
| 開發中快速迭代 | Expo Web（較快啟動） |

## 實作優先級

1. **Phase 1（立即可用）:** Expo Web + Playwright MCP — 零額外設定
2. **Phase 2（需安裝）:** 安裝 Maestro CLI + 設定 MCP Server
3. **Phase 3（漸進增加）:** 為關鍵頁面加入 `testID`，撰寫 Maestro Flow files

## 參考資源

- [Maestro MCP Server 文件](https://docs.maestro.dev/get-started/maestro-mcp)
- [Maestro React Native 支援](https://docs.maestro.dev/get-started/supported-platform/react-native)
- [Expo + Maestro E2E 測試](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)
- [Maestro CLI 指令](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options)
