import { useEffect } from 'react'
import { useRouteError } from 'react-router'

import { Button } from '@/components/ui/button'

// Shown when a page crashes while rendering, instead of React Router's developer screen.
export function RouteErrorPage() {
  const error = useRouteError()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="grid max-w-md justify-items-start gap-4">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground">
          This page ran into an unexpected problem. Reloading usually helps.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            Go to the start page
          </Button>
        </div>
      </div>
    </main>
  )
}
