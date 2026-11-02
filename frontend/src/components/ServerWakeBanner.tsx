import { LoaderCircle } from 'lucide-react'

import { useHasSlowRequests } from '@/api/slowRequests'

export function ServerWakeBanner() {
  const slow = useHasSlowRequests()

  return (
    <div role="status" aria-live="polite">
      {slow && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow dark:bg-amber-900 dark:text-amber-100">
          <LoaderCircle className="size-4 animate-spin" />
          Waking up the server, this can take up to a minute.
        </div>
      )}
    </div>
  )
}
