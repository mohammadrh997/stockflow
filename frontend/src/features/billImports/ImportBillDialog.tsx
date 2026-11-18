import { FileUp, LoaderCircle } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'

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
import { cn } from '@/lib/utils'
import { BILL_TYPES, checkBillFile, importErrorMessage } from './billFile'
import { useImportBill } from './queries'

// Choose or drop a supplier's bill; once it's read, its review opens.
export function ImportBillDialog() {
  const importBill = useImportBill()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const reading = importBill.isPending

  async function handleFile(file: File | undefined) {
    if (!file || reading) return
    const wrongFile = checkBillFile(file)
    setProblem(wrongFile)
    if (wrongFile) return
    try {
      const bill = await importBill.mutateAsync(file)
      setOpen(false)
      navigate(`/bill-imports/${bill.id}`)
    } catch (error) {
      setProblem(importErrorMessage(error))
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void handleFile(event.dataTransfer.files[0])
  }

  return (
    <Dialog
      open={open}
      // Closing while the bill is being read would lose the result.
      onOpenChange={(next) => {
        if (reading) return
        setOpen(next)
        setProblem(null)
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <FileUp />
          Import a bill
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a supplier bill</DialogTitle>
          <DialogDescription>
            The bill is read, then matched to your suppliers and products. Nothing becomes an order
            until you review it and create one.
          </DialogDescription>
        </DialogHeader>
        {problem && <ErrorMessage message={problem} />}
        <input
          ref={input}
          type="file"
          accept={BILL_TYPES.join(',')}
          className="sr-only"
          aria-label="Bill file"
          tabIndex={-1}
          onChange={(event) => {
            void handleFile(event.target.files?.[0])
            event.target.value = '' // so choosing the same file again still uploads
          }}
        />
        <button
          type="button"
          disabled={reading}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'grid justify-items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center text-sm transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
            reading && 'cursor-wait',
          )}
        >
          {reading ? (
            <>
              <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
              <span className="font-medium">Reading the bill…</span>
              <span className="text-muted-foreground">This can take up to a minute.</span>
            </>
          ) : (
            <>
              <FileUp className="size-6 text-primary" aria-hidden />
              <span className="font-medium">Choose a file, or drop it here</span>
              <span className="text-muted-foreground">PDF, JPEG, PNG or WebP, up to 5 MB</span>
            </>
          )}
        </button>
      </DialogContent>
    </Dialog>
  )
}
