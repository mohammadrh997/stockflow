import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

type FieldError = { loc: (string | number)[]; msg: string }

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  get fieldErrors(): FieldError[] {
    if (this.status !== 422 || !Array.isArray(this.detail)) return []
    return this.detail.filter(
      (item): item is FieldError =>
        typeof item === 'object' &&
        item !== null &&
        Array.isArray(item.loc) &&
        typeof item.msg === 'string',
    )
  }
}

export const NETWORK_ERROR_STATUS = 0

type FetchResult<T> = { data?: T; error?: unknown; response: Response }

// Turns an openapi-fetch result into data, or throws an ApiError.
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>
  try {
    result = await request
  } catch {
    throw new ApiError(NETWORK_ERROR_STATUS, null)
  }
  if (!result.response.ok) {
    const body = result.error
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body ? body.detail : null
    throw new ApiError(result.response.status, detail)
  }
  return result.data as T
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'

  const detail = typeof error.detail === 'string' ? error.detail : null
  switch (error.status) {
    case NETWORK_ERROR_STATUS:
      return 'Could not reach the server. Check your connection and try again.'
    case 400:
    case 409:
      return detail ?? 'The request could not be completed.'
    case 401:
      return 'Your session expired. Please log in again.'
    case 403:
      return "You don't have permission to do that."
    case 404:
      return detail ?? 'Not found.'
    case 422:
      return error.fieldErrors.map((e) => e.msg).join(' ') || 'Some fields are invalid.'
    case 429:
      return 'Too many attempts. Wait a minute and try again.'
    case 503:
      return 'The server is unavailable right now. Try again in a moment.'
    default:
      return `Something went wrong (status ${error.status}). Please try again.`
  }
}

// Puts each 422 error on its form field (by the last element of `loc`).
// Returns the messages that matched no field, to show above the form.
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): string[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [errorMessage(error)]

  const unmatched: string[] = []
  for (const { loc, msg } of error.fieldErrors) {
    const field = fields.find((name) => name === String(loc[loc.length - 1]))
    if (field) {
      setError(field, { type: 'server', message: msg })
    } else {
      unmatched.push(msg)
    }
  }
  return unmatched
}
