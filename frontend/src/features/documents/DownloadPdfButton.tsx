import { FileDown } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { errorMessage, unwrap } from '@/api/errors'
import { Button } from '@/components/ui/button'

export type PdfSource =
  | { kind: 'invoice'; id: number }
  | { kind: 'sales-order'; id: number }
  | { kind: 'purchase-order'; id: number }

// A plain link can't send the login token, so the PDF is fetched and then saved.
function fetchPdf(source: PdfSource) {
  const options = { parseAs: 'blob' as const }
  switch (source.kind) {
    case 'invoice':
      return api.GET('/invoices/{invoice_id}/pdf', {
        params: { path: { invoice_id: source.id } },
        ...options,
      })
    case 'sales-order':
      return api.GET('/sales-orders/{order_id}/pdf', {
        params: { path: { order_id: source.id } },
        ...options,
      })
    case 'purchase-order':
      return api.GET('/purchase-orders/{order_id}/pdf', {
        params: { path: { order_id: source.id } },
        ...options,
      })
  }
}

// The server names the file (BILL00001.pdf, draft-invoice-5.pdf, ...).
function filenameOf(response: Response, fallback: string): string {
  const header = response.headers.get('Content-Disposition') ?? ''
  return /filename="([^"]+)"/.exec(header)?.[1] ?? fallback
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before letting go of the file.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Props = { source: PdfSource; fallbackName: string }

export function DownloadPdfButton({ source, fallbackName }: Props) {
  const [pending, setPending] = useState(false)

  async function handleClick() {
    setPending(true)
    try {
      const request = fetchPdf(source)
      const blob = await unwrap(request)
      const { response } = await request
      save(blob as Blob, filenameOf(response, `${fallbackName}.pdf`))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Button variant="outline" disabled={pending} onClick={handleClick}>
      <FileDown />
      {pending ? 'Preparing…' : 'Download PDF'}
    </Button>
  )
}
