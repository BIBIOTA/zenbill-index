## Why
ZenBill 目前沒有 TPASS 2.0 悠遊卡同步入口，使用者無法在記帳系統內查看本人已登錄悠遊卡的常客回饋、官方月彙總、預估回饋差異，或把 TPASS 卡片與信用卡帳戶關聯。

TPASS 官方查詢頁可取得本人卡號清單與單卡月份彙總，但需要身分證字號、出生年月日與圖形驗證碼。ZenBill 需要以後端加密憑證與 OCR 同步流程封裝這個外部查詢，並在 APP 提供清楚的設定、卡片詳情、信用卡帳戶摘要與錯誤狀態。

## What Changes
- **tpass-easycard-sync**: 新增 TPASS credential、悠遊卡、月份回饋摘要資料模型與 migration。
- **tpass-easycard-sync**: 新增 TPASS HTML parser、Playwright scraper、Tesseract OCR 驗證碼處理與每日 worker 同步。
- **tpass-easycard-sync**: 新增 protected HTTP API、shared hooks 與 APP 設定入口、TPASS 設定頁、卡片詳情頁、信用卡帳戶 TPASS 區塊。
- **tpass-easycard-sync**: 新增官方月彙總解析、跨年月份推導、回饋預估、官方/預估差異與信用卡單張綁定規則。

## Impact
- Affected specs: `specs/tpass-easycard-sync/`
- Affected code: `backend/internal/domain/`, `backend/internal/repository/`, `backend/internal/usecase/`, `backend/internal/delivery/http/`, `backend/pkg/tpass/`, `backend/cmd/worker/`, `packages/shared/src/`, `app/app/settings/`, `app/app/tpass/`, `app/app/accounts/`
- Breaking changes: No。新增功能與新增 API，不改變既有發票、帳戶或交易資料合約；信用卡帳戶詳情只新增 TPASS 區塊。

## Related Artifacts
### Design
- [design.md](./design.md)
- [tasks.md](./tasks.md)

### Diagrams
- [Activity: TPASS Sync Flow](./diagrams/01-activity-tpass-sync-flow.puml)
- [ER: TPASS Data Model](./diagrams/02-er-tpass-data-model.puml)

### Figma Designs
- [Figma reference](./designs/figma.md)
