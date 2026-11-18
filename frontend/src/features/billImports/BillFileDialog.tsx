import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { api } from '@/api/client'
import { unwrap } from '@/api/errors'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

// Purchase reads a bill through its import; inventory, through an item waiting on it.
export type BillFileSource = { kind: 'import'; id: number } | { kind: 'item'; lineId: number }

// The bill is private: a plain link can't send the login token, so it's fetched.
function fetchBillFile(source: BillFileSource) {
  const options = { parseAs: 'blob' as const }
  return source.kind === 'import'
    ? api.GET('/bill-imports/{import_id}/file', {
        params: { path: { import_id: source.id } },
        ...options,
      })
    : api.GET('/missing-products/{line_id}/file', {
        params: { path: { line_id: source.lineId } },
        ...options,
      })
}

function BillFile({ source, fileType }: { source: BillFileSource; fileType: string }) {
  const file = useQuery({
    queryKey: ['bill-file', source],
    queryFn: () => unwrap(fetchBillFile(source)) as Promise<Blob>,
    // Fetched for each viewing, and not kept once the dialog closes: the bill is private.
    gcTime: 0,
    staleTime: Infinity,
  })
  const viewer = useRef<HTMLIFrameElement & HTMLImageElement>(null)
  const newTab = useRef<HTMLAnchorElement>(null)

  // A browser address for the fetched file, given to the viewer and let go of after.
  useEffect(() => {
    if (!file.data) return
    const url = URL.createObjectURL(file.data)
    if (viewer.current) viewer.current.src = url
    if (newTab.current) newTab.current.href = url
    return () => URL.revokeObjectURL(url)
  }, [file.data])

  if (file.isError) return <ErrorMessage error={file.error} onRetry={() => file.refetch()} />
  if (!file.data) return <Skeleton className="h-[70vh] w-full" />
  return (
    <div className="grid gap-3">
      {fileType === 'application/pdf' ? (
        <iframe ref={viewer} title="The bill" className="h-[70vh] w-full rounded-md border" />
      ) : (
        <img
          ref={viewer}
          alt="The bill"
          className="mx-auto max-h-[70vh] rounded-md border object-contain"
        />
      )}
      <Button asChild variant="outline" className="justify-self-start">
        <a ref={newTab} target="_blank" rel="noreferrer">
          <ExternalLink />
          Open in a new tab
        </a>
      </Button>
    </div>
  )
}

// The supplier's bill as it was uploaded, to check the reading against what's printed.
export function BillFileDialog({
  source,
  fileType,
  description = 'As the supplier sent it.',
}: {
  source: BillFileSource
  fileType: string
  description?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText />
          View bill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>The bill</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && <BillFile source={source} fileType={fileType} />}
      </DialogContent>
    </Dialog>
  )
}
