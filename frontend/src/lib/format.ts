// Money and quantities arrive as decimal strings. Number() is only used to format them for display.

const moneyFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const quantityFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
})

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatMoney(value: string): string {
  return moneyFormat.format(Number(value))
}

export function formatQuantity(value: string): string {
  return quantityFormat.format(Number(value))
}

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value))
}

export const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/
export const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/
