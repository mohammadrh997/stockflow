import { getRefreshToken, setTokens, type TokenPair } from './token'

// renewed: a fresh access token is stored. expired: the login is over; log in again.
// offline: the server couldn't be reached, so nothing is known yet; the login stays.
export type RenewOutcome = 'renewed' | 'expired' | 'offline'

const LOCK = 'stockflow-refresh'

async function callRefresh(refreshToken: string): Promise<RenewOutcome> {
  let response: Response
  try {
    // Plain fetch, not the API client: its middleware is what calls this.
    response = await globalThis.fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    return 'offline'
  }
  if (!response.ok) return response.status >= 500 ? 'offline' : 'expired'
  setTokens((await response.json()) as TokenPair)
  return 'renewed'
}

// Each refresh token works once, and the server ends the whole login if it sees one twice.
// Every tab shares the stored tokens, so renewals must never overlap: the tabs take turns
// through a browser lock, and whoever gets it second finds the stored token already
// replaced, and uses the new one instead of sending the old one again.
async function renewInTurn(usedWith: string | null): Promise<RenewOutcome> {
  const current = getRefreshToken()
  if (current === null) return 'expired' // logged out, or a login from before refresh tokens
  if (current !== usedWith) return 'renewed' // another request or tab already renewed it
  return callRefresh(current)
}

let inFlight: Promise<RenewOutcome> | null = null

// Called when a request sent with `usedWith` as the stored refresh token came back 401.
export function renewSession(usedWith: string | null): Promise<RenewOutcome> {
  // Requests failing together in one tab share one renewal.
  if (!inFlight) {
    const run = () => renewInTurn(usedWith)
    // The lock's typing wraps the callback's promise once more; awaited, it is the outcome.
    const turn = (
      navigator.locks ? navigator.locks.request(LOCK, run) : run()
    ) as Promise<RenewOutcome>
    inFlight = turn.finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
