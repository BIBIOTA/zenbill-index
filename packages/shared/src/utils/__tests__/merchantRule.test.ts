import { describe, expect, it } from 'vitest'
import { testMerchantRule } from '../merchantRule'

describe('testMerchantRule', () => {
  it('CONTAINS ignores case', () => {
    expect(testMerchantRule('CONTAINS', 'uber', 'UBER EATS 台灣')).toBe('match')
    expect(testMerchantRule('CONTAINS', '全家', '統一超商')).toBe('no-match')
  })
  it('EXACT ignores case but needs the whole name', () => {
    expect(testMerchantRule('EXACT', 'line pay', 'LINE Pay')).toBe('match')
    expect(testMerchantRule('EXACT', 'LINE', 'LINE Pay')).toBe('no-match')
  })
  it('REGEX is case-sensitive like Go regexp', () => {
    expect(testMerchantRule('REGEX', '^UBER', 'UBER EATS')).toBe('match')
    expect(testMerchantRule('REGEX', '^uber', 'UBER EATS')).toBe('no-match')
  })
  it('REGEX honours a leading (?i)', () => {
    expect(testMerchantRule('REGEX', '(?i)^uber\\s*eats', 'Uber Eats')).toBe('match')
  })
  it('reports an invalid pattern', () => {
    expect(testMerchantRule('REGEX', '([', 'x')).toBe('invalid')
  })
})
