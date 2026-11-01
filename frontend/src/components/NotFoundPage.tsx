import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="grid justify-items-start gap-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
      <Button asChild variant="outline">
        <Link to="/">Go to the start page</Link>
      </Button>
    </div>
  )
}
