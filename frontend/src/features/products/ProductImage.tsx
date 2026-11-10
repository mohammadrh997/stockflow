import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ProductThumb } from '@/components/ProductThumb'
import { Button } from '@/components/ui/button'
import { checkImageFile, IMAGE_TYPES, uploadErrorMessage } from '@/lib/imageUpload'
import { useProductImage, type Product } from './queries'

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
        className="aspect-square w-full max-w-64 rounded-lg bg-background object-contain"
        label={hasImage ? undefined : 'No image yet'}
      />
      {problem && <ErrorMessage message={problem} />}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={IMAGE_TYPES.join(',')}
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
