import { PRICE_PATTERN, QUANTITY_PATTERN } from '@/lib/format'

export const quantityRules = {
  required: 'Enter a quantity.',
  pattern: { value: QUANTITY_PATTERN, message: 'Use a number with up to 3 decimals.' },
  validate: (value: string) => Number(value) > 0 || 'Must be more than 0.',
}

export const unitPriceRules = {
  pattern: { value: PRICE_PATTERN, message: 'Use a number with up to 2 decimals.' },
}
