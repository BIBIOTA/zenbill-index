/**
 * 規則引擎「測試看看」：在前端模擬後端 `matchRule`（backend/internal/usecase/invoice_match_service.go）。
 * - CONTAINS / EXACT：不分大小寫。
 * - REGEX：Go `regexp`，分大小寫；開頭 `(?i)` 時不分大小寫（JS 不支援這個寫法，改用 `i` flag）。
 * JS 與 Go RE2 的語法有少數差異（例如 Go 不支援 lookahead），這裡以 JS 解析為準。
 */
import type { MatchType } from '../types/index.ts'

export type RuleTestResult = 'match' | 'no-match' | 'invalid'

export function testMerchantRule(matchType: MatchType, keyword: string, sellerName: string): RuleTestResult {
  if (matchType === 'EXACT') return sellerName.toLowerCase() === keyword.toLowerCase() ? 'match' : 'no-match'
  if (matchType === 'CONTAINS') return sellerName.toLowerCase().includes(keyword.toLowerCase()) ? 'match' : 'no-match'
  const insensitive = keyword.startsWith('(?i)')
  try {
    const re = new RegExp(insensitive ? keyword.slice(4) : keyword, insensitive ? 'i' : '')
    return re.test(sellerName) ? 'match' : 'no-match'
  } catch {
    return 'invalid'
  }
}
