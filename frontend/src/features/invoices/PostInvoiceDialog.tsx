import { useState } from 'react'
import { toast } from 'sonner'

import { ErrorMessage } from '@/components/ErrorMessage'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { addDays, today } from '@/lib/dates'
import { usePostInvoice, type Invoice } from './queries'

const TERMS = [
  { label: 'On receipt', days: 0 },
  { label: '15 days', days: 15 },
  { label: '30 days', days: 30 },
]

export function PostInvoiceDialog({ invoice }: { invoice: Invoice }) {
  const post = usePostInvoice(invoice.id)
  const [open, setOpen] = useState(false)
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState(() => addDays(today(), 30))
  const [error, setError] = useState<unknown>(null)
  const dueTooEarly = dueDate !== '' && invoiceDate !== '' && dueDate < invoiceDate

  function handleOpenChange(next: boolean) {
    if (post.isPending) return
    setOpen(next)
    setInvoiceDate(today())
    setDueDate(addDays(today(), 30))
    setError(null)
  }

  async function handlePost() {
    if (dueTooEarly) return
    setError(null)
    try {
      const posted = await post.mutateAsync({
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
      })
      toast.success(`Posted ${posted.number}`)
      setOpen(false)
    } catch (e) {
      setError(e)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Post</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post this invoice?</DialogTitle>
          <DialogDescription>
            It gets its number and its lines and total are frozen. It can no longer be edited.
          </DialogDescription>
        </DialogHeader>
        {error !== null && <ErrorMessage error={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Invoice date" htmlFor="invoice-date">
            <Input
              id="invoice-date"
              type="date"
              value={invoiceDate}
              disabled={post.isPending}
              onChange={(event) => setInvoiceDate(event.target.value)}
            />
          </FormField>
          <FormField
            label="Due date"
            htmlFor="due-date"
            error={dueTooEarly ? "The due date can't be before the invoice date." : undefined}
          >
            <Input
              id="due-date"
              type="date"
              value={dueDate}
              aria-invalid={dueTooEarly ? true : undefined}
              disabled={post.isPending}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Payment terms:</span>
          {TERMS.map((term) => (
            <Button
              key={term.label}
              type="button"
              variant="outline"
              size="sm"
              disabled={post.isPending || invoiceDate === ''}
              onClick={() => setDueDate(addDays(invoiceDate, term.days))}
            >
              {term.label}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={post.isPending || dueTooEarly} onClick={handlePost}>
            {post.isPending ? 'Posting…' : 'Post invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
