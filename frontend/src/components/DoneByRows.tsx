import { formatDateTime } from '@/lib/format'

type Props = {
  // "Created", "Posted", "Validated"...
  label: string
  at: string
  by: { name: string } | null
}

// Two rows for a details list (<dl>): when it happened, and who did it.
export function DoneByRows({ label, at, by }: Props) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{formatDateTime(at)}</dd>
      {by && (
        <>
          <dt className="text-muted-foreground">{label} by</dt>
          <dd>{by.name}</dd>
        </>
      )}
    </>
  )
}
