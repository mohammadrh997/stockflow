import type { ReactNode } from 'react'

// Purchase and sales order lines share this shape.
export type OrderLine = {
  id: number
  product_id: number
  quantity: string
  unit_price: string
  subtotal: string
}

export type NewLine = {
  product_id: number
  quantity: string
  unit_price?: string
}

// Only the changed field is sent.
export type LineChanges = {
  quantity?: string
  unit_price?: string
}

// Extra information under a product, e.g. its available stock on sales orders.
export type LineHint = (productId: number) => ReactNode
