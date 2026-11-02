import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { usePageTitle } from '@/lib/usePageTitle'

type Props = {
  title: ReactNode
  // The browser tab title; defaults to the title when that is plain text.
  pageTitle?: string
  // A link back to the list this page belongs to.
  back?: { to: string; label: string }
  actions?: ReactNode
}

export function PageHeader({ title, pageTitle, back, actions }: Props) {
  usePageTitle(pageTitle ?? (typeof title === 'string' ? title : undefined))

  return (
    <div className="grid gap-2">
      {back && (
        <Link
          to={back.to}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-2xl font-semibold">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
