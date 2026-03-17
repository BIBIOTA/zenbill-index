export interface StockTransactionInfo {
  action: 'buy' | 'sell'
  shares: number
  symbol: string
  pricePerShare: number
  isExistingHolding: boolean
}

export function parseStockTransactionNote(note: string): StockTransactionInfo | null {
  const match = note.match(/^(Buy|Sell)\s+([\d.]+)\s+shares\s+of\s+(\S+)\s+@\s+([\d.]+)/)
  if (!match) return null
  return {
    action: match[1].toLowerCase() as 'buy' | 'sell',
    shares: Number(match[2]),
    symbol: match[3],
    pricePerShare: Number(match[4]),
    isExistingHolding: note.includes('計入既有持股'),
  }
}
