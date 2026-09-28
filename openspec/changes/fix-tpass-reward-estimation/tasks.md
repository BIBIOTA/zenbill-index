# Tasks: fix-tpass-reward-estimation

> 實作切片依「後端計算 → 迴歸網 → UI」排序。1~3 必須**一起**進版：三個缺口在
> production 會互相抵銷（見 design.md GAP 3），分批修會讓中間狀態的 delta 更難解讀。

## 1. 綠色運輸加碼沿用官方金額

- [x] 1.1 `TpassRewardEstimate` 新增 `GreenTransportReward` 欄位，值為月結五個
      `*_green_reward` 官方欄位之和
      - WHEN 月結的短途公車綠色加碼為 15、其餘群組為 0
      - THEN `GreenTransportReward` 為 15
      - AND 該值計入 `EstimatedTotalRewardAmount`
- [x] 1.2 欄位註解明確標示「沿用官方公布金額、非系統估算」，並說明官方回饋條件表格
      未公布加碼規則
      - WHEN 未來讀者想知道為何不算而是抄
      - THEN 註解能回答，不需回頭查 DB 或條件表
- [x] 1.3 不新增任何加碼規則推算（不猜定額、不猜費率、不猜上限）
      - WHEN 月結沒有任何綠色加碼欄位有值
      - THEN `GreenTransportReward` 為 0 且不影響其他群組的估算

## 2. 逐群組 `math.Ceil`

- [x] 2.1 分組回饋計算改為 `math.Ceil(金額 × 費率 − epsilon)`，套用在**每個群組**
      （短途公車、中長途國道、以及軌道的每一個運具）
      - WHEN 金額 498、費率 15%（精確值 74.7）
      - THEN 該群組回饋為 75（不是 74）
      - WHEN 金額 1074、費率 30%（精確值 322.2）
      - THEN 該群組回饋為 323（不是 322）
- [x] 2.2 不對總計進位
      - WHEN 兩個群組各自有小數
      - THEN 總計等於兩個群組**各自進位後**相加
- [x] 2.3 以 epsilon（`1e-9`）吸收浮點誤差後才進位
      - WHEN 金額 × 費率 的精確值是 150、float64 卻算成 150.00000000000003
      - THEN 結果為 150，不被多推成 151
      - NOTE 反向的 149.99999999999997 不需要處理（ceil 本來就得到 150）；
        實測整數金額 1..20000 × 現行三種費率，epsilon 從未改變結果，
        它是對未來新增費率的防線而非現行資料的修正
- [x] 2.4 註解記錄「進位是由官方逐群組整數欄位反推的經驗法則，官方條件表未載明小數規則」
      - WHEN 日後官方改成四捨五入
      - THEN delta 告警會亮，且讀者知道這是規則變更而非我方寫錯

## 3. 軌道加碼改逐運具計次

- [x] 3.1 `railAddOnReward` 改為對北捷 / 臺鐵 / 新北捷運**各自**比 11 次門檻，
      達標者只就自己的金額發 2%，最後相加
      - WHEN 北捷 10 次 / 245 元、臺鐵 1 次 / 48 元、新北捷運 0
      - THEN 軌道加碼為 0（舊實作以合併 11 次誤發 5.86）
      - WHEN 北捷 8 次 / 242 元、臺鐵 5 次 / 285 元
      - THEN 軌道加碼為 0（舊實作以合併 13 次誤發 10.54）
- [x] 3.2 單一運具達標時，費率只作用在該運具自己的金額上
      - WHEN 北捷 12 次 / 300 元、臺鐵 3 次 / 500 元
      - THEN 軌道加碼為 `ceil(300 × 2%)`，不含臺鐵的 500 元
- [x] 3.3 註解引用官方條件表「各運具分開計算」，並記錄 27 個月無任何單一運具達 11 次
      → 此加碼從來就不該發過，這解釋了官方三個軌道回饋欄位恆為 0

## 4. Production 月結迴歸網

- [x] 4.1 以 27 列 production 真實月結建立 table test（各群組次數 / 金額 / 官方回饋 /
      綠色加碼 / 官方總計）
      - WHEN 測試執行
      - THEN **每一列的 `calculation_delta_amount` 為 0**
- [x] 4.2 逐群組斷言（短途公車基本、中長途國道基本、軌道加碼、綠色加碼各自比對）
      - WHEN 兩個群組的錯誤剛好互相抵銷、總計卻對
      - THEN 測試仍然變紅（GAP 2 與 GAP 3 的互相抵銷已在 production 真實發生過）
- [x] 4.3 逐群組期望值只存在於測試檔
      - WHEN 測試新增
      - THEN 不動 schema、不動 repository、不動 API 合約
- [x] 4.4 反向驗證：分別移除 1 / 2 / 3 的修正，對應月份列必須變紅
      - WHEN 修正被移除
      - THEN 測試失敗（證明迴歸網真的有守門，不是恆綠）

## 5. UI 顯示綠色加碼

- [x] 5.1 `packages/shared` 的 `TpassMonthlySummary` 型別補 5 個 `*_green_reward`
      - WHEN APP / Web 讀取月結
      - THEN 五個綠色加碼欄位有型別，不需 `any` 或斷言
- [x] 5.2 Web `frontend/src/pages/TpassCardDetailPage.tsx` 群組表格新增「綠色加碼」欄
      - WHEN 該月所有群組的綠色加碼皆為 0
      - THEN 欄位**仍然顯示**（欄位在不在是官方版面的事實，不隨資料浮動）
- [x] 5.3 APP `app/app/settings/tpass/[id].tsx` 群組表格新增「綠色加碼」欄，行為同 5.2
- [x] 5.4 兩端各加一行小字：該欄採官方公布金額、非系統估算
      - WHEN 使用者看到綠色加碼有值
      - THEN 不會誤以為系統能預測加碼金額
- [x] 5.5 不抽共用元件、不引入前端測試框架（見 design.md「不在範圍」）

## 6. 驗證與回填

- [x] 6.1 後端測試與品質
      - `go test ./internal/usecase/... -run TpassReward -count=1 -v` → PASS
      - `go test ./...` 全數 PASS、`go build ./...` OK、`go vet ./...` 乾淨、`gofmt` 乾淨
      - ⚠️ `golangci-lint run` **未執行**：本機未安裝 golangci-lint（`go vet` 代替）
- [x] 6.2 前端型別驗證
      - `frontend/` `tsc --noEmit` → clean；`packages/shared` typecheck → clean
      - `app/` `tsc` baseline 實測為 **45** 個既存錯誤（非 44），改動前後輸出 diff 完全相同 → 零新增
      - `app/` `expo export --platform android` → 成功
- [ ] 6.3 人工驗證：兩端在 dev 看 2026-08 / 2026-09 兩列
      - WHEN 檢視該兩列
      - THEN 綠色加碼顯示 15
      - AND 橫向加總等於官方總計 90 / 156
- [ ] 6.4 回填：不直寫 DB
      - WHEN 下一次 detail sync 執行
      - THEN `tpass_sync_service` 對每個月份列重跑 `rewardService.Apply` 後 upsert，
        自動回填全部歷史月份的 `estimated_total_reward_amount` 與 `calculation_delta_amount`
- [ ] 6.5 回填後確認 27 列 delta 全為 0
      - WHEN 回填完成
      - THEN 日後任何非 0 的 `calculation_delta_amount` 都是真訊號
