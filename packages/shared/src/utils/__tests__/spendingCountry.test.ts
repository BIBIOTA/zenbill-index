import { describe, expect, it } from 'vitest'
import {
  CURRENCY_COUNTRY,
  cardBaseName,
  cardNameKey,
  currencyCountry,
  deriveSpendingCountry,
  isSameCardOtherCurrency,
  sameCardAccountIds,
} from '../spendingCountry'

describe('currencyCountry', () => {
  it('maps only single-country currencies', () => {
    expect(CURRENCY_COUNTRY).toEqual({ TWD: 'TW', JPY: 'JP', KRW: 'KR', THB: 'TH', HKD: 'HK', SGD: 'SG', VND: 'VN' })
    expect(currencyCountry('jpy')).toBe('JP')
    expect(currencyCountry('USD')).toBeNull()
    expect(currencyCountry(null)).toBeNull()
  })
})

describe('deriveSpendingCountry', () => {
  it('uses the override first', () => {
    expect(deriveSpendingCountry({ countryOverride: 'us', merchantDefaultCountry: 'JP', accountCurrency: 'JPY' })).toEqual({
      country: 'US',
      known: true,
      overseas: true,
    })
  })
  it('then the merchant default country', () => {
    expect(deriveSpendingCountry({ merchantDefaultCountry: 'kr', accountCurrency: 'JPY' })).toEqual({
      country: 'KR',
      known: true,
      overseas: true,
    })
    expect(deriveSpendingCountry({ merchantDefaultCountry: 'TW', originalCurrency: 'JPY' }).overseas).toBe(false)
  })
  it('then the original currency, even when it maps to nothing', () => {
    expect(deriveSpendingCountry({ originalCurrency: 'THB', accountCurrency: 'TWD' }).country).toBe('TH')
    expect(deriveSpendingCountry({ originalCurrency: 'USD', accountCurrency: 'TWD' })).toEqual({
      country: null,
      known: false,
      overseas: true,
    })
  })
  it('then the account currency, defaulting to TWD → TW', () => {
    expect(deriveSpendingCountry({ accountCurrency: 'JPY' }).country).toBe('JP')
    expect(deriveSpendingCountry({ accountCurrency: 'TWD' })).toEqual({ country: 'TW', known: true, overseas: false })
    expect(deriveSpendingCountry({})).toEqual({ country: 'TW', known: true, overseas: false })
    expect(deriveSpendingCountry({ accountCurrency: 'EUR' })).toEqual({ country: null, known: false, overseas: true })
  })
  it('treats empty strings as missing', () => {
    expect(deriveSpendingCountry({ countryOverride: '', merchantDefaultCountry: null, originalCurrency: '', accountCurrency: 'JPY' }).country).toBe('JP')
  })
})

describe('cardBaseName', () => {
  it('strips trailing currency brackets and words for display', () => {
    expect(cardBaseName('玉山熊本熊卡 （台幣）')).toBe('玉山熊本熊卡')
    expect(cardBaseName('永豐幣倍卡 （日圓）')).toBe('永豐幣倍卡')
    expect(cardBaseName('熊本熊卡(JPY)')).toBe('熊本熊卡')
    expect(cardBaseName('熊本熊卡 日幣')).toBe('熊本熊卡')
    expect(cardBaseName('熊本熊卡 JPY')).toBe('熊本熊卡')
    expect(cardBaseName('熊本熊卡 新台幣')).toBe('熊本熊卡')
  })
  it('keeps non-currency brackets and names', () => {
    expect(cardBaseName('幣倍卡（3703）')).toBe('幣倍卡（3703）')
    expect(cardBaseName('ANA 卡')).toBe('ANA 卡')
    expect(cardBaseName(' CUBE 卡 ')).toBe('CUBE 卡')
  })
})

describe('cardNameKey', () => {
  it('normalizes currency words, codes, separators and case', () => {
    expect(cardNameKey('熊本熊卡（日幣）')).toBe('熊本熊卡')
    expect(cardNameKey('熊本熊卡 JPY')).toBe('熊本熊卡')
    expect(cardNameKey('玉山熊本熊卡 （台幣）')).toBe('玉山熊本熊卡')
    expect(cardNameKey('熊本熊卡 新台幣')).toBe('熊本熊卡')
    expect(cardNameKey('cube 卡')).toBe('CUBE卡')
    expect(cardNameKey('幣倍卡（3703）')).toBe('幣倍卡（3703）')
  })
})

const twd = { id: 'twd', name: '熊本熊卡', type: 'CREDIT', currency: 'TWD', bank_id: 'b1' }
const jpy = { id: 'jpy', name: '熊本熊卡 日幣', type: 'CREDIT', currency: 'JPY', bank_id: 'b1' }
const other = { id: 'cube', name: 'CUBE 卡', type: 'CREDIT', currency: 'TWD', bank_id: 'b2' }
const bank = { id: 'bank', name: '熊本熊卡（日幣）', type: 'BANK', currency: 'JPY', bank_id: 'b1' }

describe('isSameCardOtherCurrency', () => {
  it('requires same name key, same type, different currency', () => {
    expect(isSameCardOtherCurrency(twd, jpy)).toBe(true)
    expect(isSameCardOtherCurrency(twd, twd)).toBe(false)
    expect(isSameCardOtherCurrency(twd, { ...jpy, currency: 'TWD', id: 'x' })).toBe(false)
    expect(isSameCardOtherCurrency(twd, bank)).toBe(false)
    expect(isSameCardOtherCurrency(twd, other)).toBe(false)
  })
  it('compares banks only when both are set', () => {
    expect(isSameCardOtherCurrency(twd, { ...jpy, bank_id: 'b9' })).toBe(false)
    expect(isSameCardOtherCurrency(twd, { ...jpy, bank_id: null })).toBe(true)
    expect(isSameCardOtherCurrency({ ...twd, bank_id: undefined }, jpy)).toBe(true)
  })
})

describe('sameCardAccountIds', () => {
  it('returns the other-currency accounts of the same card', () => {
    const accounts = [twd, jpy, other, bank]
    expect(sameCardAccountIds(twd, accounts)).toEqual(['jpy'])
    expect(sameCardAccountIds(other, accounts)).toEqual([])
    expect(sameCardAccountIds({ ...jpy, bank_id: 'b9' }, accounts)).toEqual([])
  })
})
