import { Link } from 'react-router'

import { useAuth } from '@/auth/useAuth'
import { visibleNavItems } from '@/components/layout/navigation'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'

export function HomePage() {
  const { user } = useAuth()

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Welcome, {user?.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleNavItems(user).map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4" />
                  {label}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
