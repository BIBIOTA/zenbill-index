# Design: zen-bill CLAUDE.md 改寫

**日期:** 2026-05-07
**目標:** 將 825 行的百科全書式 CLAUDE.md 改寫為 AI 工作手冊，目標 100 行以內

---

## 問題

現有 `CLAUDE.md` 有以下問題：
- 825 行，包含大量 Clean Architecture 教學、目錄結構說明、歷史文件索引
- 重複 SPEC.md 已有的內容（需求、架構、Schema）
- Skills 介紹（200+ 行）應由 skill 自己負責
- 專案狀態追蹤應在 SPEC.md/TODO，不在 CLAUDE.md

## 目標

AI 工作手冊：只放「開發時的規則、指令、坑點」，讓 Claude 快速上手。

## 新結構（方案 A：結構化精簡版）

### §1 語言
一行：預設繁體中文，程式碼用英文。

### §2 專案概覽
3~5 行：專案名稱、描述、技術棧。不重複 SPEC.md。

### §3 架構導航
一個「目的 → 路徑」表格，取代現有的大段目錄說明。

### §4 常用指令
Code blocks：啟動 API、測試、lint、docker、manual_sync。
不放安裝說明（屬於 README）。

### §5 開發規範
條列式，只放不明顯、容易犯錯的專案特有規則：
- Domain layer 禁止 import GORM
- Regex pattern 必須用 `regex-tester` skill 驗證後才能上線
- 涉及 `transactions` + `accounts` 寫入必須用 DB transaction
- `backend/` 是獨立 git repo，有自己的 `.git`

不放 Clean Architecture 通識說明。

### §6 4-Phase SOP
一個表格（phase / 重點 / 硬規則），加一行「使用 `start-feature` skill 自動執行」。
細節由各 skill 負責，不在這裡展開。

### §7 已知坑點
條列式，只放實戰踩坑（不會出現在 SPEC.md）：
- CGO 依賴：tesseract/leptonica 路徑設定
- `manual_sync` 本機執行需改 `database.host`
- Playwright `page.OnResponse()` handler 累積問題
- E-Invoice DOM：`dp__cell_offset` 的正確選擇器位置

## 刪除的內容

| 刪除內容 | 原因 |
|---------|------|
| 目錄結構詳細說明 | 可從程式碼直接讀取 |
| Clean Architecture 教學 | 通識，不是專案特有規則 |
| Skills 詳細介紹（觸發關鍵字、手動執行指令）| 由 skill 自己負責 |
| 專案當前狀態（Phase 完成進度）| 屬於 SPEC.md/TODO |
| 歷史文件索引（已整合至 SPEC.md 的舊路徑）| 過時資訊 |
| 各 Layer 職責詳細說明 | 重複架構通識 |

## 預期結果

- 行數：~100 行（從 825 行減少 88%）
- 可讀性：5 分鐘內讀完
- 維護性：只有專案特有資訊，不需要隨架構演進頻繁更新
