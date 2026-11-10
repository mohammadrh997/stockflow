import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { ApiError, errorMessage } from '@/api/errors'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ProductThumb } from '@/components/ProductThumb'
import { Button } from '@/components/ui/button'
import { useProductImage, type Product } from './queries'

// The same limits as the server, checked first so a wrong file fails at once.
const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

function checkImageFile(file: File): string | null {
  if (!TYPES.includes(file.type)) return 'Choose a JPEG, PNG or WebP image.'
  if (file.size > MAX_BYTES) return 'The image must be 5 MB or smaller.'
  return null
}

// The general messages don't fit uploads: say what is wrong with the image instead.
function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'The image must be 5 MB or smaller.'
    if (error.status === 503 && error.detail === "Image storage isn't configured") {
      return "Image uploads aren't set up on this server yet."
    }
    if (error.status === 422 && typeof error.detail === 'string') {
      return `${error.detail.charAt(0).toUpperCase()}${error.detail.slice(1)}.`
    }
  }
  return errorMessage(error)
}

type Props = { product: Product; canManage: boolean }

// Sits inside the product's block, beside its fields; managers change it from here.
export function ProductImage({ product, canManage }: Props) {
  const image = useProductImage(product.id)
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const busy = image.upload.isPending || image.remove.isPending
  const hasImage = product.image_url !== null

  async function handleFile(file: File | undefined) {
    if (!file) return
    const wrongFile = checkImageFile(file)
    setProblem(wrongFile)
    if (wrongFile) return
    try {
      await image.upload.mutateAsync(file)
      toast.success(hasImage ? 'Image replaced' : 'Image added')
    } catch (error) {
      setProblem(uploadErrorMessage(error))
    }
  }

  return (
    <div className="grid content-start gap-3">
      <ProductThumb
        url={product.image_url}
        className="aspect-square w-40 rounded-lg sm:w-full"
        label={hasImage ? undefined : 'No image yet'}
      />
      {problem && <ErrorMessage message={problem} />}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={TYPES.join(',')}
            className="sr-only"
            aria-label="Image file"
            tabIndex={-1}
            onChange={(event) => {
              void handleFile(event.target.files?.[0])
              event.target.value = '' // so choosing the same file again still uploads
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {image.upload.isPending ? 'Uploading…' : hasImage ? 'Replace image' : 'Upload image'}
          </Button>
          {hasImage && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" disabled={busy}>
                  Remove image
                </Button>
              }
              title="Remove the image?"
              description={`${product.name} will show without a picture.`}
              confirmLabel="Remove image"
              destructive
              onConfirm={async () => {
                await image.remove.mutateAsync()
                toast.success('Image removed')
              }}
            />
          )}
        </div>
      )}
      {canManage && <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB.</p>}
    </div>
  )
}
