import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/lib/usePageTitle'

export function ForbiddenPage() {
  usePageTitle('No access')
  return (
    <div className="grid justify-items-start gap-4">
      <h1 className="text-2xl font-semibold">No access</h1>
      <p className="text-muted-foreground">You don't have permission to see this page.</p>
      <Button asChild variant="outline">
        <Link to="/">Go to the start page</Link>
      </Button>
    </div>
  )
}
