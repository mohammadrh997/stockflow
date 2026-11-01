import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'

type Props = {
  label: string
  htmlFor: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}

export function FormField({ label, htmlFor, error, hint, children }: Props) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
