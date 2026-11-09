import type { Invoice } from './queries'

export function isOverdue(invoice: Invoice, today: string): boolean {
  return (
    invoice.state === 'posted' &&
    invoice.payment_state !== 'paid' &&
    invoice.due_date !== null &&
    invoice.due_date < today
  )
}

export function invoiceTitle(invoice: Invoice): string {
  return invoice.number ?? `Draft #${invoice.id}`
}
