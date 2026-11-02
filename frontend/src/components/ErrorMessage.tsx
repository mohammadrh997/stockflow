import { CircleAlert } from 'lucide-react'

import { errorMessage } from '@/api/errors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type Props = {
  error?: unknown
  message?: string
  onRetry?: () => void
}

export function ErrorMessage({ error, message, onRetry }: Props) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{message ?? errorMessage(error)}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
