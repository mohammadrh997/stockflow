import { compareQuantities } from '@/lib/quantity'
import type { OrderLine } from './types'
import type { OrderTransfers } from './useOrderTransfers'

type Props = {
  kind: 'receipt' | 'delivery'
  state: string
  lines: OrderLine[]
  transfers: OrderTransfers
}

const WORDS = {
  receipt: { partly: 'Partly received', closed: 'received', done: 'received' },
  delivery: { partly: 'Partly delivered', closed: 'delivered', done: 'delivered' },
}

// A word on progress the steps alone can't show: part moved with a backorder waiting,
// or the order closed although not everything moved. Null when there is nothing to add.
export function orderMovementText({ kind, state, lines, transfers }: Props): string | null {
  const words = WORDS[kind]
  const short = lines.some((line) => compareQuantities(transfers.moved(line.id), line.quantity) < 0)

  let text: string | null = null
  if (state === 'confirmed' && transfers.hasMoved) {
    text = transfers.backorderWaiting
      ? `${words.partly} · the rest is on a backorder`
      : words.partly
  } else if (state === words.done && transfers.hasMoved && short) {
    text = `Closed with only part ${words.closed}; the rest was cancelled`
  }

  return text
}
