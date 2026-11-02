import { PRICE_PATTERN, QUANTITY_PATTERN } from '@/lib/format'

const QUANTITY_FORMAT = 'Use a number with up to 3 decimals.'
const QUANTITY_POSITIVE = 'Must be more than 0.'
const PRICE_FORMAT = 'Use a number with up to 2 decimals.'

export const quantityRules = {
  required: 'Enter a quantity.',
  pattern: { value: QUANTITY_PATTERN, message: QUANTITY_FORMAT },
  validate: (value: string) => Number(value) > 0 || QUANTITY_POSITIVE,
}

export const unitPriceRules = {
  pattern: { value: PRICE_PATTERN, message: PRICE_FORMAT },
}

// The same checks for the fields edited in place in the lines table.
export function checkQuantity(text: string): string | null {
  if (!QUANTITY_PATTERN.test(text)) return QUANTITY_FORMAT
  return Number(text) > 0 ? null : QUANTITY_POSITIVE
}

export function checkUnitPrice(text: string): string | null {
  return PRICE_PATTERN.test(text) ? null : PRICE_FORMAT
}
