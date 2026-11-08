import { describe, expect, it } from 'vitest'

import { compareQuantities, fromThousandths, sumQuantities, toThousandths } from './quantity'

describe('quantity arithmetic', () => {
  it('adds without floating-point drift', () => {
    expect(sumQuantities(['0.1', '0.2'])).toBe('0.300')
    expect(sumQuantities(['4.000', '3.000', '2.5'])).toBe('9.500')
    expect(sumQuantities([])).toBe('0.000')
  })

  it('reads and writes thousandths, including negatives', () => {
    expect(toThousandths('2.5')).toBe(2500n)
    expect(toThousandths('12')).toBe(12000n)
    expect(toThousandths('-1.250')).toBe(-1250n)
    expect(fromThousandths(-1250n)).toBe('-1.250')
  })

  it('compares quantities written differently', () => {
    expect(compareQuantities('10', '10.000')).toBe(0)
    expect(compareQuantities('2.5', '2.499')).toBe(1)
    expect(compareQuantities('0', '0.001')).toBe(-1)
  })
})
