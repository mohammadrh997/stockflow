import { Link } from 'react-router'

import { usePartner } from '@/features/partners/queries'
import { useProduct } from '@/features/products/queries'
import { useWarehouses } from '@/features/warehouses/queries'

// Records reference each other by id; these resolve a name through the shared query cache.

export function ProductName({ id }: { id: number }) {
  const product = useProduct(id)
  return (
    <Link to={`/products/${id}`} className="hover:underline">
      {product.data?.name ?? `Product #${id}`}
    </Link>
  )
}

export function PartnerName({ id }: { id: number }) {
  const partner = usePartner(id)
  return (
    <Link to={`/partners/${id}`} className="hover:underline">
      {partner.data?.name ?? `Partner #${id}`}
    </Link>
  )
}

export function WarehouseName({ id }: { id: number }) {
  const warehouses = useWarehouses()
  const warehouse = warehouses.data?.find((w) => w.id === id)
  return <>{warehouse ? warehouse.name : `Warehouse #${id}`}</>
}
