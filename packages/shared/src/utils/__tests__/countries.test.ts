import { describe, expect, it } from 'vitest'
import {
  COMMON_COUNTRY_CODES,
  COUNTRIES,
  countryName,
  isCountryCode,
  searchCountries,
} from '../countries'

describe('COUNTRIES', () => {
  it('puts the common countries first, in order', () => {
    expect(COMMON_COUNTRY_CODES).toEqual(['JP', 'KR', 'US', 'TH', 'SG', 'HK', 'VN', 'TW'])
    expect(COUNTRIES.slice(0, 8).map((c) => c.code)).toEqual(COMMON_COUNTRY_CODES)
  })
  it('covers all ISO 3166-1 alpha-2 codes exactly once', () => {
    const codes = COUNTRIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.length).toBe(249)
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/)
      expect(c.name.length).toBeGreaterThan(0)
    }
  })
  it('sorts the rest by code', () => {
    const rest = COUNTRIES.slice(8).map((c) => c.code)
    expect(rest).toEqual([...rest].sort())
  })
  it('uses zh-TW names', () => {
    expect(countryName('JP')).toBe('日本')
    expect(countryName('TW')).toBe('台灣')
    expect(countryName('kr')).toBe('韓國')
    expect(countryName('ZZ')).toBeNull()
  })
})

describe('isCountryCode', () => {
  it('accepts valid codes case-insensitively', () => {
    expect(isCountryCode('JP')).toBe(true)
    expect(isCountryCode('jp')).toBe(true)
    expect(isCountryCode('ZZ')).toBe(false)
    expect(isCountryCode('JPN')).toBe(false)
  })
})

describe('searchCountries', () => {
  it('returns the full list for an empty query', () => {
    expect(searchCountries('  ')).toEqual(COUNTRIES)
  })
  it('matches by code case-insensitively, exact code first', () => {
    const r = searchCountries('jp')
    expect(r[0].code).toBe('JP')
  })
  it('matches by Chinese name substring', () => {
    expect(searchCountries('日本').map((c) => c.code)).toEqual(['JP'])
    expect(searchCountries('泰').map((c) => c.code)).toContain('TH')
  })
  it('treats 臺 and 台 as the same', () => {
    expect(searchCountries('臺灣').map((c) => c.code)).toEqual(['TW'])
  })
  it('keeps common countries ahead among name matches', () => {
    const r = searchCountries('國').map((c) => c.code)
    expect(r.indexOf('KR')).toBeLessThan(r.indexOf('DE'))
    expect(r.indexOf('US')).toBeLessThan(r.indexOf('FR'))
  })
  it('returns nothing for no match', () => {
    expect(searchCountries('火星')).toEqual([])
  })
})
