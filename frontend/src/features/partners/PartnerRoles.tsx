import { Badge } from '@/components/ui/badge'
import type { Partner } from './queries'

export function PartnerRoles({ partner }: { partner: Partner }) {
  return (
    <div className="flex gap-1">
      {partner.is_customer && <Badge variant="outline">Customer</Badge>}
      {partner.is_supplier && <Badge variant="outline">Supplier</Badge>}
    </div>
  )
}
