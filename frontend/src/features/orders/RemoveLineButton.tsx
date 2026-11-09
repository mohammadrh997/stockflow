import { Button } from '@/components/ui/button'
import { useProduct } from '@/features/products/queries'

type Props = { productId: number; disabled: boolean; onClick: () => void }

// Names the product, so a screen reader hears "Remove Desk" rather than a row of "Remove".
export function RemoveLineButton({ productId, disabled, onClick }: Props) {
  const product = useProduct(productId)
  const name = product.data?.name ?? `product #${productId}`

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Remove ${name}`}
      disabled={disabled}
      onClick={onClick}
    >
      Remove
    </Button>
  )
}
