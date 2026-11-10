import { Ellipsis, FileDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDownloadPdf, type PdfSource } from '@/features/documents/useDownloadPdf'

type Props = { source: PdfSource; reference: string }

// Less frequent order actions, kept out of the crowded header: for now, the PDF.
export function OrderMoreMenu({ source, reference }: Props) {
  const { download, pending } = useDownloadPdf(source, reference)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="More actions">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={pending} onSelect={() => void download()}>
          <FileDown />
          Download PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
