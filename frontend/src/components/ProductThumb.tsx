import { Package } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  url: string | null | undefined
  className?: string
  // Shown under the icon in a large empty box, e.g. "No image yet".
  label?: string
}

// A product's picture, or a neutral box when it has none (or it fails to load).
export function ProductThumb({ url, className, label }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const box = cn('shrink-0 overflow-hidden rounded-md border bg-muted', className ?? 'size-8')

  if (!url || failedUrl === url) {
    return (
      <span
        className={cn(
          box,
          'grid place-content-center justify-items-center gap-1 text-muted-foreground',
        )}
        aria-hidden={label ? undefined : true}
      >
        <Package className={label ? 'size-10' : 'size-4'} />
        {label && <span className="text-xs">{label}</span>}
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
