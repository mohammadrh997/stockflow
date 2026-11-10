import { FileDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useDownloadPdf, type PdfSource } from './useDownloadPdf'

type Props = { source: PdfSource; fallbackName: string }

export function DownloadPdfButton({ source, fallbackName }: Props) {
  const { download, pending } = useDownloadPdf(source, fallbackName)

  return (
    <Button variant="outline" disabled={pending} onClick={download}>
      <FileDown />
      {pending ? 'Preparing…' : 'Download PDF'}
    </Button>
  )
}
