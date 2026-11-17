import { ChevronRight } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'

import { usePageTitle } from '@/lib/usePageTitle'

export type Crumb = { to: string; label: string }

type Props = {
  title: ReactNode
  // The browser tab title; defaults to the title when that is plain text.
  pageTitle?: string
  // The pages above this one, e.g. the list it belongs to. The page itself is added at the end.
  trail?: Crumb[]
  actions?: ReactNode
  // Small actions about the record itself (Archive), shown right next to its name.
  nameActions?: ReactNode
}

export function PageHeader({ title, pageTitle, trail, actions, nameActions }: Props) {
  const name = pageTitle ?? (typeof title === 'string' ? title : undefined)
  usePageTitle(name)

  return (
    <div className="grid gap-2">
      {trail && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {trail.map((crumb) => (
              <Fragment key={crumb.to}>
                <li>
                  <Link to={crumb.to} className="hover:text-foreground hover:underline">
                    {crumb.label}
                  </Link>
                </li>
                <li aria-hidden>
                  <ChevronRight className="size-3.5" />
                </li>
              </Fragment>
            ))}
            {name && (
              <li aria-current="page" className="text-foreground">
                {name}
              </li>
            )}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-3 text-2xl font-semibold">{title}</h1>
          {nameActions}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
