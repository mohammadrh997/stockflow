import type { ReactNode } from 'react'

type Props = {
  title: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, actions }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="flex items-center gap-3 text-2xl font-semibold">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
