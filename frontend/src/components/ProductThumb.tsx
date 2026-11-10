import { Package } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  url: string | null | undefined
  className?: string
}

// A product's picture, or a neutral box when it has none (or it fails to load).
export function ProductThumb({ url, className }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const box = cn('shrink-0 overflow-hidden rounded-md border bg-muted', className ?? 'size-8')

  if (!url || failedUrl === url) {
    return (
      <span className={cn(box, 'grid place-items-center text-muted-foreground')} aria-hidden>
        <Package className="size-1/2" />
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={cn(box, 'object-cover')}
      onError={() => setFailedUrl(url)}
    />
  )
}
