# ZenBill README 重組設計

**日期:** 2026-05-07  
**範圍:** zen-bill index README 瘦身，各子 repo 新增/改寫 README

## 目標

將 index README 簡化為「入口頁」，操作細節下移至各子 repo，避免文件重複與維護負擔。

## 決策

- Index 策略：精簡 index（方案 A）
- 技術棧呈現：badge 形式
- Environment Variables：移到 backend README
- License：CC BY-NC-ND 4.0

## 各檔案改動範圍

### `zen-bill/README.md`（改寫）

**保留：**
- 標題
- Badges（擴充：Go 1.25、PostgreSQL 16、Playwright、React 19、TypeScript、Expo 55）
- 專案概覽（功能列表）
- Documentation 表格

**移除：**
- Quick Start 整節
- Installation
- Tesseract OCR Installation
- Development Commands
- Database Access
- Environment Variables

**改寫：**
- Project Structure → 只顯示頂層四個項目，不展開子結構
- License → CC BY-NC-ND 4.0

**Project Structure 呈現：**
```
zen-bill/
├── backend/     # Go API Server、發票爬蟲、規則引擎
├── frontend/    # React 19 + Vite Web 介面
├── app/         # Expo + React Native 行動應用
├── SPEC.md      # 產品與技術規格
└── CLAUDE.md    # AI 輔助開發指南
```

### `backend/README.md`（新建）

章節順序：
1. 標題 + 一行描述
2. Tech Stack（Go、PostgreSQL、GORM、Gin、Playwright、Tesseract）
3. Prerequisites & Installation（含 Tesseract OCR、CGO flags）
4. Project Structure（backend 內部完整結構）
5. Development Commands
6. Database Access
7. Environment Variables

### `frontend/README.md`（改寫，取代 Vite 預設模板）

章節順序：
1. 標題 + 一行描述
2. Tech Stack（React 19、TypeScript、Vite 7）
3. Installation
4. Development Commands

### `app/README.md`（新建）

章節順序：
1. 標題 + 一行描述
2. Tech Stack（Expo 55、React Native 0.83、TypeScript）
3. Installation
4. Development Commands（含 APK 打包指令）

## License 條款

採用 **Creative Commons CC BY-NC-ND 4.0**：
- 允許查看與分享
- 禁止修改（No Derivatives）
- 禁止商業使用（Non-Commercial）

README 中標示：
```
This project is licensed under CC BY-NC-ND 4.0.
© 2025 Yuki Ota
```

## 不在範圍內

- SPEC.md、CLAUDE.md 內容不變
- 各子 repo 的程式碼不異動
- 不新增或刪除功能說明內容，只是搬移
