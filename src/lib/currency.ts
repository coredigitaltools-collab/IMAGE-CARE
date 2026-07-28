// ImageCare's functional/ledger currency is UGX — every KPI total in
// mockData.ts is stored in UGX. Individual sales can still be recorded in
// whatever currency the customer paid in (see RecentSale.currency), which
// is normal for a business serving walk-in and foreign customers.
//
// These rates are placeholders for local development and MUST be replaced
// with a live FX source (e.g. a rates table synced from a real provider)
// before this becomes financially authoritative — see IMC-002 §3 ("protect
// financial accuracy"). They exist so the reporting-currency selector has
// something real to compute with today.

export type SupportedCurrency = 'UGX' | 'USD' | 'KES'

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['UGX', 'USD', 'KES']

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  UGX: 'UGX — Ugandan Shilling',
  USD: 'USD — US Dollar',
  KES: 'KES — Kenyan Shilling',
}

// How many UGX equal 1 unit of the given currency.
const UGX_PER_UNIT: Record<SupportedCurrency, number> = {
  UGX: 1,
  USD: 3800,
  KES: 26,
}

export function convertFromUgx(amountUgx: number, toCurrency: SupportedCurrency): number {
  return amountUgx / UGX_PER_UNIT[toCurrency]
}

export function convertToUgx(amount: number, fromCurrency: SupportedCurrency): number {
  return amount * UGX_PER_UNIT[fromCurrency]
}
