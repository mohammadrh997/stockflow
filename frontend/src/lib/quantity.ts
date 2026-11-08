// Quantities are decimal strings with up to 3 decimals. Adding or comparing them as JavaScript
// numbers can drift (0.1 + 0.2), so they are counted exactly in thousandths with BigInt.

const SCALE = 1000n

export function toThousandths(value: string): bigint {
  const text = value.trim()
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace('-', '').split('.')
  const amount = BigInt(whole || '0') * SCALE + BigInt((fraction + '000').slice(0, 3))
  return negative ? -amount : amount
}

export function fromThousandths(value: bigint): string {
  const negative = value < 0n
  const amount = negative ? -value : value
  const fraction = (amount % SCALE).toString().padStart(3, '0')
  return `${negative ? '-' : ''}${amount / SCALE}.${fraction}`
}

export function sumQuantities(values: string[]): string {
  return fromThousandths(values.reduce((total, value) => total + toThousandths(value), 0n))
}

export function compareQuantities(a: string, b: string): number {
  const difference = toThousandths(a) - toThousandths(b)
  return difference === 0n ? 0 : difference > 0n ? 1 : -1
}
