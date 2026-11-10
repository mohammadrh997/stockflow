import { ImageIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { checkImageFile, IMAGE_TYPES, uploadErrorMessage } from '@/lib/imageUpload'
import { useCompanyLogo, type Company } from './queries'

// The logo printed at the top of every PDF. Logos are often wide, so it isn't cropped square.
export function CompanyLogo({ company }: { company: Company }) {
  const logo = useCompanyLogo()
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const busy = logo.upload.isPending || logo.remove.isPending
  const hasLogo = company.logo_url !== null

  async function handleFile(file: File | undefined) {
    if (!file) return
    const wrongFile = checkImageFile(file)
    setProblem(wrongFile)
    if (wrongFile) return
    try {
      await logo.upload.mutateAsync(file)
      toast.success(hasLogo ? 'Logo replaced' : 'Logo added')
    } catch (error) {
      setProblem(uploadErrorMessage(error))
    }
  }

  return (
    <div className="grid content-start gap-3">
      <div className="flex h-32 w-full max-w-64 items-center justify-center rounded-lg border bg-background p-3">
        {company.logo_url ? (
          <img
            src={company.logo_url}
            alt={`${company.name} logo`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="grid justify-items-center gap-1 text-sm text-muted-foreground">
            <ImageIcon className="size-6" aria-hidden />
            No logo yet
          </span>
        )}
      </div>
      {problem && <ErrorMessage message={problem} />}
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          className="sr-only"
          aria-label="Logo file"
          tabIndex={-1}
          onChange={(event) => {
            void handleFile(event.target.files?.[0])
            event.target.value = '' // so choosing the same file again still uploads
          }}
        />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {logo.upload.isPending ? 'Uploading…' : hasLogo ? 'Replace logo' : 'Upload logo'}
        </Button>
        {hasLogo && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" disabled={busy}>
                Remove logo
              </Button>
            }
            title="Remove the logo?"
            description="Documents will print with the company name only."
            confirmLabel="Remove logo"
            destructive
            onConfirm={async () => {
              await logo.remove.mutateAsync()
              toast.success('Logo removed')
            }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB.</p>
    </div>
  )
}
