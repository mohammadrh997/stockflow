import { Button } from '@/components/ui/button'

type Props = {
  label: string
  isSubmitting: boolean
  // Whether any field differs from what was last saved.
  isDirty: boolean
  // Puts the fields back to what was last saved.
  onDiscard: () => void
  // On by default for forms that edit a saved record. Off for creating one, where the
  // button stays ready (a new record is saved even when nothing was typed over the defaults).
  trackChanges?: boolean
}

// A form's save button. Editing a record, it only wakes up once something changed, and says
// so beside it; after saving it goes quiet again, so a greyed-out button means all is saved.
export function SaveBar({ label, isSubmitting, isDirty, onDiscard, trackChanges = true }: Props) {
  const pending = trackChanges && isDirty && !isSubmitting
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={isSubmitting || (trackChanges && !isDirty)}>
        {isSubmitting ? 'Saving…' : label}
      </Button>
      {pending && (
        <>
          <Button type="button" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
          <span className="text-sm text-muted-foreground" role="status">
            Unsaved changes
          </span>
        </>
      )}
    </div>
  )
}
