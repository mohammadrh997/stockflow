// The login lives in localStorage, so every tab of the app shares it.
const ACCESS_KEY = 'stockflow.token'
const REFRESH_KEY = 'stockflow.refresh'

export type TokenPair = { access_token: string; refresh_token: string }

// Short-lived (minutes): sent with every request.
export function getToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

// Long-lived (days) and single-use: only ever sent to /auth/refresh and /auth/logout.
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, tokens.access_token)
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
}

// An access token alone, as tests set one up; without a refresh token it can't be renewed.
export function setToken(token: string): void {
  localStorage.setItem(ACCESS_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// Other tabs see a change through the storage event; this is the key to watch.
export const ACCESS_TOKEN_KEY = ACCESS_KEY
