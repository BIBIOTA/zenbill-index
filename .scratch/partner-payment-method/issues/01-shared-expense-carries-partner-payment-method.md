# 01 — 共同支出帶著 partner 付款方式進出 API

**What to build:** 使用者建立共同支出時可以附上一個「partner 付款方式」的文字值，之後查詢這筆支出時拿得回同一個值。沒有附上時，這筆支出的一切行為與現在完全相同 —— 拆分金額、待收款、連動的個人交易都不受影響。

這是整個功能的地基：值先要能在 ZenBill 內部存在並來回，其他票才有東西可以搬運與呈現。

依 ADR-0001，這是一個**標籤**而非綁定：不驗證值是否屬於任何清單、不指向任何帳戶、不影響任何餘額。命名綁 partner 這個**角色**，不綁人名。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] 共同支出實體具備一個選填的 partner 付款方式欄位，型別為可為空的短字串
- [x] Schema 變更透過專案既有的 AutoMigrate 路徑生效，未新增手寫 SQL migration
- [x] 既有的共同支出資料未被 backfill，維持空值
- [x] 建立共同支出的 API 接受選填的 partner 付款方式，並原封不動存下
- [x] 查詢共同支出的 API 回應帶出該欄位
- [x] 傳入不屬於任何清單的任意字串一樣被接受（不做值域驗證）
- [x] 未傳入時該欄位為空，且拆分金額與連動個人交易的行為與變更前一致
- [x] 共同支出服務層測試涵蓋「帶值時落到實體上」與「未帶值時其餘行為不變」
- [x] AutoMigrate 已對 dev DB 執行（`docker exec zenbill_api_dev sh -c "cd /app && go run ./cmd/migrate"`）—— dev **不會**自動 migrate：`air` 只跑 api，schema 變更後要手動跑一次，否則建立共同支出會以 `column "partner_payment_method" does not exist` 回 500。prod 不必手動，`scripts/deploy.sh` 的第 2 步就是 `run --rm api-prod /app/migrate`，且失敗即中止部署
- [ ] `golangci-lint` 通過 — **未執行：本機未安裝 golangci-lint**。替代驗證：`go build ./...`、`go vet ./internal/...`、`go test ./...` 全數通過
