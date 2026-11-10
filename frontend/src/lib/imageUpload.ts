import { ApiError, errorMessage } from '@/api/errors'

// The same limits as the server, checked first so a wrong file fails at once.
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

export function checkImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Choose a JPEG, PNG or WebP image.'
  if (file.size > MAX_BYTES) return 'The image must be 5 MB or smaller.'
  return null
}

// The general messages don't fit uploads: say what is wrong with the image instead.
export function uploadErrorMessage(error: unknown): string {
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

// openapi-fetch sends JSON by default; the upload endpoints take the file as form data.
export function fileUpload(file: File) {
  return {
    // The generated type says string; the server takes the file as multipart form data.
    body: { file: file as unknown as string },
    bodySerializer: (body: { file: string }) => {
      const form = new FormData()
      form.append('file', body.file as unknown as File)
      return form
    },
  }
}
