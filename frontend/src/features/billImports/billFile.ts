import { ApiError, errorMessage } from '@/api/errors'

// The same limits as the server, checked first so a wrong file fails at once.
export const BILL_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

export function checkBillFile(file: File): string | null {
  if (!BILL_TYPES.includes(file.type)) return 'Choose a PDF, or a JPEG, PNG or WebP photo.'
  if (file.size > MAX_BYTES) return 'The bill must be 5 MB or smaller.'
  return null
}

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${text.endsWith('.') ? '' : '.'}`
}

// What went wrong with an import, said for this job rather than as a general error.
export function importErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = typeof error.detail === 'string' ? error.detail : null
    if (error.status === 413) return 'The bill must be 5 MB or smaller.'
    if (error.status === 429) return 'You can import 10 bills an hour. Try again later.'
    if (error.status === 503 && detail === "Bill reading isn't configured") {
      return "Bill reading isn't set up on this server yet."
    }
    // The server's own reason: "the PDF is password-protected", "no items were found on
    // the bill", "bill reading is busy; try again in a minute"...
    if ((error.status === 422 || error.status === 503) && detail) return sentence(detail)
  }
  return errorMessage(error)
}
