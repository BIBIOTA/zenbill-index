import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type {
  ApiResponse,
  CreditCardStatementInput,
  CreditCardStatementView,
} from '../types/index.ts'
import { creditCardDuesQueryKey } from './useCreditCardDues.ts'

/**
 * 全部放在 `['accounts', accountId, 'statements', ...]` 底下：
 * 交易 mutation 既有的 `['accounts']` invalidate（前綴比對）會一併刷新帳單的計算欄位
 * （`cycle_net`、`amount_paid`、`diff`…），不必在每個交易 hook 另外列舉。
 */
export const creditCardStatementKeys = {
  all: (accountId: string) => ['accounts', accountId, 'statements'] as const,
  cycle: (accountId: string, cycleEnd: string) =>
    ['accounts', accountId, 'statements', cycleEnd] as const,
  latestClosed: (accountId: string) =>
    ['accounts', accountId, 'statements', 'latest-closed'] as const,
}

/** 寫入帳單後要刷新的 query；hook 與測試共用同一份，避免 key 漂移。 */
export const creditCardStatementInvalidators = {
  write: (qc: QueryClient, accountId: string) => {
    qc.invalidateQueries({ queryKey: creditCardStatementKeys.all(accountId) })
    qc.invalidateQueries({ queryKey: creditCardDuesQueryKey })
  },
}

const statementPath = (accountId: string, cycleEnd: string) =>
  `/accounts/${accountId}/statements/${cycleEnd}`

/**
 * 某張卡某一期（`cycleEnd` 為 `YYYY-MM-DD`，ZenBill 的週期結束日）的帳單與應繳計算。
 * 週期導覽器用；`accountId` 或 `cycleEnd` 為空時不發 request。
 */
export function useCreditCardStatement(accountId: string | undefined, cycleEnd: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: creditCardStatementKeys.cycle(accountId ?? '', cycleEnd ?? ''),
    queryFn: () =>
      api.get<ApiResponse<CreditCardStatementView>>(statementPath(accountId!, cycleEnd!)),
    enabled: !!accountId && !!cycleEnd,
    select: (res) => res.data,
  })
}

/** 今天之前最近一期已結帳的帳單與應繳計算；帳戶頁「待繳」區塊用。 */
export function useLatestClosedCreditCardStatement(accountId: string | undefined) {
  const api = getApiClient()
  return useQuery({
    queryKey: creditCardStatementKeys.latestClosed(accountId ?? ''),
    queryFn: () =>
      api.get<ApiResponse<CreditCardStatementView>>(
        `/accounts/${accountId}/statements/latest-closed`,
      ),
    enabled: !!accountId,
    select: (res) => res.data,
  })
}

export interface UpsertCreditCardStatementVariables {
  accountId: string
  /** `YYYY-MM-DD`，必須是該卡合法的週期結束日，否則後端回 400 */
  cycleEnd: string
  input: CreditCardStatementInput
}

/** 手動填寫／修改帳單（`PUT`，upsert）。回傳和 GET 相同格式的 view。 */
export function useUpsertCreditCardStatement() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, cycleEnd, input }: UpsertCreditCardStatementVariables) =>
      api
        .put<ApiResponse<CreditCardStatementView>>(statementPath(accountId, cycleEnd), input)
        .then((r) => r.data),
    onSuccess: (_data, { accountId }) => creditCardStatementInvalidators.write(qc, accountId),
  })
}

export interface DeleteCreditCardStatementVariables {
  accountId: string
  cycleEnd: string
}

/** 刪除帳單；該期之後回到預估。 */
export function useDeleteCreditCardStatement() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, cycleEnd }: DeleteCreditCardStatementVariables) =>
      api.delete<ApiResponse<null>>(statementPath(accountId, cycleEnd)),
    onSuccess: (_data, { accountId }) => creditCardStatementInvalidators.write(qc, accountId),
  })
}
