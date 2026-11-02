import { Badge } from '@/components/ui/badge'
import type { User } from './queries'

export function AccessSummary({ user }: { user: User }) {
  if (user.is_admin) return <Badge>Admin</Badge>

  const modules = [
    ['Sales', user.sales_access],
    ['Purchase', user.purchase_access],
    ['Inventory', user.inventory_access],
  ] as const
  const granted = modules.filter(([, level]) => level !== 'none')
  if (granted.length === 0) return <span className="text-muted-foreground">No access</span>

  return (
    <div className="flex flex-wrap gap-1">
      {granted.map(([label, level]) => (
        <Badge key={label} variant="outline">
          {label}: {level}
        </Badge>
      ))}
    </div>
  )
}
