import { useState, useCallback, useMemo, useEffect } from 'react'
import { View, Text, FlatList, ActivityIndicator, Pressable } from 'react-native'
import { useQueries } from '@tanstack/react-query'
import {
  useAccounts,
  useRefreshStockPrices,
  formatStockLabel,
  useTransactionStats,
  useNetAssetTrend,
  useInfiniteTransactions,
  useInvoices,
  useSharedLedgers,
  getApiClient,
  calculateStockPnL,
  calculateStockDailyPerformance,
  calculateStockDailySummary,
} from '@zenbill/shared'
import type { Account, ApiResponse, SharedLedger, SharedLedgerSummary, Transaction, TransactionType } from '@zenbill/shared'
import { getCurrencySymbol } from '../../constants/currencies'
import { AssetSummary } from '../../components/dashboard/AssetSummary'
import { StatCard } from '../../components/dashboard/StatCard'
import { SpendingChart } from '../../components/dashboard/SpendingChart'
import { NetAssetChart } from '../../components/dashboard/NetAssetChart'
import { CategoryDonut } from '../../components/dashboard/CategoryDonut'
import { TransactionFilterChips, TransactionRow } from '../../components/dashboard/RecentTransactions'
import { LoadingScreen } from '../../components/ui/LoadingScreen'
import { FAB } from '../../components/ui/FAB'
import { router } from 'expo-router'

function StockInvestmentSection({ accounts }: { accounts: Account[] }) {
  const stockAccounts = accounts.filter(a => a.type === 'STOCK' && a.shares_held > 0)
  const refreshPrices = useRefreshStockPrices()
  const formatSignedMoney = (currency: string, value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '-' : ''
    return `${sign}${getCurrencySymbol(currency)}${Math.abs(value).toLocaleString()}`
  }

  const performanceColor = (value: number | null) => {
    if (value == null || value === 0) return '#94a3b8'
    return value > 0 ? '#10b981' : '#ef4444'
  }

  const lastUpdated = stockAccounts
    .filter(s => s.last_price_at)
    .sort((a, b) => new Date(b.last_price_at!).getTime() - new Date(a.last_price_at!).getTime())[0]
    ?.last_price_at

  if (stockAccounts.length === 0) return null

  const byCurrency = stockAccounts.reduce<Record<string, { marketValue: number; totalCost: number }>>((acc, s) => {
    const cur = s.currency || 'TWD'
    if (!acc[cur]) acc[cur] = { marketValue: 0, totalCost: 0 }
    acc[cur].marketValue += s.shares_held * s.last_price
    acc[cur].totalCost += s.shares_held * s.avg_cost_price
    return acc
  }, {})

  return (
    <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600' }}>股票投資</Text>
        <Pressable onPress={() => refreshPrices.mutate()} disabled={refreshPrices.isPending}>
          <Text style={{ fontSize: 12, color: '#94a3b8' }}>
            {refreshPrices.isPending ? '更新中...' : '重新整理'}
          </Text>
        </Pressable>
      </View>

      {Object.entries(byCurrency).map(([cur, { marketValue, totalCost }]) => {
        const pnl = marketValue - totalCost
        const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0
        const daily = calculateStockDailySummary(stockAccounts.filter(s => (s.currency || 'TWD') === cur))
        return (
          <View key={cur} style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 11, color: '#94a3b8' }}>總市值 {cur}</Text>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
              {getCurrencySymbol(cur)}{marketValue.toLocaleString()}
            </Text>
            <Text style={{ fontSize: 12, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>
              {pnl >= 0 ? '+' : ''}{getCurrencySymbol(cur)}{Math.abs(pnl).toLocaleString()}
              {' '}({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
            </Text>
            <Text style={{ fontSize: 12, color: performanceColor(daily?.pnl ?? null) }}>
              今日 {daily
                ? `${formatSignedMoney(cur, daily.pnl)} (${daily.pnlPercent >= 0 ? '+' : ''}${daily.pnlPercent.toFixed(1)}%)`
                : '--'}
            </Text>
          </View>
        )
      })}

      {stockAccounts.map(stock => {
        const { pnl, pnlPercent } = calculateStockPnL(stock)
        const daily = calculateStockDailyPerformance(stock)
        return (
          <View key={stock.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 8 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '500' }}>{formatStockLabel(stock)}</Text>
              <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                {stock.shares_held} 股 · {getCurrencySymbol(stock.currency)}{stock.last_price.toLocaleString()}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
                {getCurrencySymbol(stock.currency)}{stock.balance.toLocaleString()}
              </Text>
              <Text style={{ fontSize: 11, color: pnl >= 0 ? '#10b981' : '#ef4444' }}>
                {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
              </Text>
              <Text style={{ fontSize: 11, color: performanceColor(daily?.pnl ?? null) }}>
                今日 {daily
                  ? `${formatSignedMoney(stock.currency, daily.pnl)} (${daily.pnlPercent >= 0 ? '+' : ''}${daily.pnlPercent.toFixed(1)}%)`
                  : '--'}
              </Text>
            </View>
          </View>
        )
      })}
      {lastUpdated && (
        <Text style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
          股價更新於 {new Date(lastUpdated).toLocaleString('zh-TW')}
        </Text>
      )}
    </View>
  )
}

export default function DashboardPage() {
  const [typeFilter, setTypeFilter] = useState<TransactionType | undefined>(undefined)

  const { data: accounts } = useAccounts()
  const refreshStockPrices = useRefreshStockPrices()

  useEffect(() => {
    if (accounts?.some(a => a.type === 'STOCK' && a.shares_held > 0)) {
      refreshStockPrices.mutate()
    }
  }, [accounts?.length])

  const stats = useTransactionStats(6)
  const netAssetTrend = useNetAssetTrend(6)
  const { data: invRes } = useInvoices({ status: 'PENDING', page_size: 1 })
  const { data: ledgers } = useSharedLedgers()

  const {
    data: txPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteTransactions({
    page_size: 20,
    ...(typeFilter ? { type: typeFilter } : {}),
  })

  const api = getApiClient()
  const summaryQueries = useQueries({
    queries: (ledgers ?? ([] as SharedLedger[])).map((ledger) => ({
      queryKey: ['shared-ledgers', ledger.id, 'summary'] as const,
      queryFn: () =>
        api
          .get<ApiResponse<SharedLedgerSummary>>(`/shared-ledgers/${ledger.id}/summary`)
          .then((r) => r.data),
    })),
  })

  const totalReceivable = summaryQueries.reduce((sum, q) => {
    const balance = (q.data as SharedLedgerSummary | undefined)?.receivable_balance ?? 0
    return balance > 0 ? sum + balance : sum
  }, 0)

  const transactions = useMemo(
    () => txPages?.pages.flatMap((p) => p.data) ?? [],
    [txPages]
  )

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (stats.isLoading) return <LoadingScreen />

  const currentMonth = stats.data?.monthly?.[stats.data.monthly.length - 1]
  const pendingInvoices = invRes?.pagination?.total ?? 0

  const ListHeader = (
    <View>
      <AssetSummary />

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <StatCard
          label="本月支出"
          value={`$${currentMonth?.expense?.toLocaleString() ?? '0'}`}
          accentColor="#ef4444"
        />
        <StatCard
          label="本月收入"
          value={`$${currentMonth?.income?.toLocaleString() ?? '0'}`}
          accentColor="#10b981"
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <StatCard
          label="待處理發票"
          value={`${pendingInvoices} 張`}
          accentColor="#f59e0b"
        />
        <StatCard
          label="待收款項"
          value={`$${totalReceivable.toLocaleString()}`}
          accentColor="#8b5cf6"
        />
      </View>

      <StockInvestmentSection accounts={accounts ?? []} />

      <NetAssetChart data={netAssetTrend.data ?? []} />

      <SpendingChart monthly={stats.data?.monthly ?? []} />

      <CategoryDonut categories={stats.data?.current_month_categories ?? []} />

      <TransactionFilterChips selected={typeFilter} onSelect={setTypeFilter} />
    </View>
  )

  const ListFooter = isFetchingNextPage ? (
    <ActivityIndicator style={{ paddingVertical: 20 }} color="#94a3b8" />
  ) : !hasNextPage && transactions.length > 0 ? (
    <Text style={{ textAlign: 'center', color: '#94a3b8', paddingVertical: 20, fontSize: 13 }}>
      沒有更多交易了
    </Text>
  ) : null

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionRow transaction={item} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={{ padding: 16 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
      />
      <FAB testID="dashboard_fab" onPress={() => router.push('/transactions/new')} />
    </View>
  )
}
