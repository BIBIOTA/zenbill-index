# ZenBill

**自動化記帳系統** - 工程師思維的個人財務管理工具

[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Go-2EAD33?style=flat)](https://playwright.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-55-000020?style=flat&logo=expo)](https://expo.dev/)

## 📖 專案概覽

ZenBill 是一個以「自動化」為核心的記帳系統，專為有技術背景的使用者設計：

- **🔄 自動化發票同步** - 透過 Playwright 爬蟲自動抓取財政部電子發票資料
  - ✅ 手機條碼登入
  - ✅ CAPTCHA OCR 自動辨識（Tesseract，準確率 >90%）
  - ✅ API Response 攔截
  - ✅ 發票明細解析與儲存
- **🧠 規則引擎** - 使用 Regex/關鍵字自動清洗商家名稱並歸類
  - ✅ Domain 模型完成
  - 🚧 Usecase 開發中
- **💳 資產生命週期** - 模擬信用卡自動扣款與複式簿記
  - ✅ Account & Transaction entities
  - 🚧 Auto-pay 邏輯開發中

## 📁 Project Structure

```
zen-bill/
├── backend/     # Go API Server、發票爬蟲、規則引擎
├── frontend/    # React 19 + Vite Web 介面
├── app/         # Expo + React Native 行動應用
├── SPEC.md      # 產品與技術規格
└── CLAUDE.md    # AI 輔助開發指南
```

## 📚 Documentation

| 文件 | 說明 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | 開發指南、專案架構、Skills 使用說明 |
| [SPEC.md](./SPEC.md) | 產品規格、技術架構、測試案例 |

## 📝 License

[![CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-nd/4.0/)

© 2025 Yuki Ota. This project is licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/).  
Source code is shared for reference purposes only. Modification and commercial use are not permitted.
