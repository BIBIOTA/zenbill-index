/**
 * 回饋方案（Reward Plan）的 API 型別。
 *
 * 依 `.scratch/card-reward-cap/spec.md` 的「資料」「計算」「API」三節撰寫；後端 contract
 * 定稿後只需對齊這一個檔案。JSON 欄位一律 snake_case，日期為 `YYYY-MM-DD`，
 * 金額為儲存值（與交易相同，未除以幣別倍數）。詞彙見 `CONTEXT.md`「回饋方案」。
 */
import type { Transaction } from './index.ts'

/** 計算期間：上限重新起算的區間。 */
export type RewardPeriodType =
  | 'billing_cycle'
  | 'calendar_month'
  | 'calendar_quarter'
  | 'whole_validity'

/** 地點條件；`countries` 時看 `countries` 陣列。 */
export type RewardLocationType = 'any' | 'domestic' | 'overseas' | 'countries'

/** 計入模式：`auto` 符合條件就計入；`manual` 只有手動勾選的才計入。 */
export type RewardInclusionMode = 'auto' | 'manual'

/** 顯示用單位；1 點視為 1 元，不換算。 */
export type RewardUnitLabel = '元' | '點'

export interface RewardPlan {
  id: string
  user_id: string
  name: string
  /** 0.06 代表 6%；0 < rate ≤ 1 */
  rate: number
  /** 預估回饋的上限（以 `currency` 計）；null = 無上限 */
  cap_amount: number | null
  unit_label: RewardUnitLabel
  /** 計算幣別，例如 `TWD` */
  currency: string
  period_type: RewardPeriodType
  /** `whole_validity` 時兩者必填 */
  starts_on: string | null
  ends_on: string | null
  location_type: RewardLocationType
  /** ISO 3166-1 alpha-2；只有 `location_type = countries` 時有值 */
  countries: string[]
  /** 單筆最低金額（以 `currency` 計，跨幣別先換算再比）；null = 不限 */
  min_single_amount: number | null
  inclusion_mode: RewardInclusionMode
  note: string
  /** 至少一個；`billing_cycle` 時必須全是 CREDIT 且 closing_day 相同 */
  account_ids: string[]
  /** 指定商家；空陣列 = 不限商家 */
  merchant_ids: string[]
  /** 排除商家 */
  excluded_merchant_ids: string[]
  created_at: string
  updated_at: string
}

/** `POST /reward-plans` 與 `PUT /reward-plans/:id` 的 body。 */
export interface RewardPlanInput {
  name: string
  rate: number
  cap_amount?: number | null
  unit_label: RewardUnitLabel
  currency: string
  period_type: RewardPeriodType
  starts_on?: string | null
  ends_on?: string | null
  location_type: RewardLocationType
  countries?: string[]
  min_single_amount?: number | null
  inclusion_mode: RewardInclusionMode
  note?: string
  account_ids: string[]
  merchant_ids?: string[]
  excluded_merchant_ids?: string[]
}

/** 一條方案在某個計算期間的進度（帳戶頁、總覽共用；不含明細）。 */
export interface RewardProgress {
  plan: RewardPlan
  /** 0 = 目前這期，-1 = 上一期…；`whole_validity` 永遠是 0 */
  offset: number
  /** 計算期間（已和方案有效期間取交集），`YYYY-MM-DD`，含頭含尾 */
  period_start: string
  period_end: string
  /** 計入交易換算到 `plan.currency` 後的總和 */
  qualifying_spend: number
  /** floor(qualifying_spend × rate)，有上限時封頂 */
  estimated_reward: number
  /** cap_amount / rate；無上限時 null */
  spend_cap: number | null
  /** max(0, spend_cap − qualifying_spend)；無上限時 null */
  remaining_spend: number | null
  /** max(0, qualifying_spend − spend_cap)；無上限時 0 */
  over_cap_spend: number
  /** remaining_spend == 0 */
  capped: boolean
  /** qualifying_spend / spend_cap；無上限時 null */
  usage_ratio: number | null
  /** `location_type = countries` 時，海外但未判定國家、且未手動標記的筆數 */
  unknown_country_count: number
  /** 有任何交易經過匯率換算 → UI 顯示「≈」 */
  converted: boolean
  /** 永遠 true：不扣退款與 INCOME → UI 顯示「未扣除退款」 */
  excludes_refunds: boolean
}

/** 方案明細中的一筆交易。 */
export interface RewardProgressTransaction {
  transaction: Transaction
  /** 換算到 `plan.currency` 後的金額 */
  converted_amount: number
  converted: boolean
  /** 手動標記：true = 計入、false = 不計入、null = 未標記（依條件比對） */
  mark_included: boolean | null
}

/** `GET /reward-plans/:id/progress?offset=N` */
export interface RewardPlanProgressDetail extends RewardProgress {
  included_transactions: RewardProgressTransaction[]
  excluded_transactions: RewardProgressTransaction[]
}

/** `PUT /reward-plans/:id/marks/:transaction_id` 的 body。 */
export interface RewardPlanMarkInput {
  included: boolean
}
