import { getRefreshToken, setTokens, type TokenPair } from './token'

// renewed: a fresh access token is stored. expired: the login is over; log in again.
// unavailable: renewing didn't happen this time (no connection, a rate limit, a server
// error), so nothing is known about the login, which stays. `response` is the server's
// answer, to give the waiting request in place of its 401; none when it couldn't be reached.
export type RenewOutcome =
  { kind: 'renewed' } | { kind: 'expired' } | { kind: 'unavailable'; response?: Response }

const RENEWED: RenewOutcome = { kind: 'renewed' }
const EXPIRED: RenewOutcome = { kind: 'expired' }

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
    return { kind: 'unavailable' }
  }
  if (!response.ok) {
    // A rate limit (429) is refused before the token is looked at, so it isn't used up:
    // like a server error, it says nothing about the login, which can be renewed later.
    return response.status >= 500 || response.status === 429
      ? { kind: 'unavailable', response }
      : EXPIRED
  }
  setTokens((await response.json()) as TokenPair)
  return RENEWED
}

// Each refresh token works once, and the server ends the whole login if it sees one twice.
// Every tab shares the stored tokens, so renewals must never overlap: the tabs take turns
// through a browser lock, and whoever gets it second finds the stored token already
// replaced, and uses the new one instead of sending the old one again.
async function renewInTurn(usedWith: string | null): Promise<RenewOutcome> {
  const current = getRefreshToken()
  if (current === null) return EXPIRED // logged out, or a login from before refresh tokens
  if (current !== usedWith) return RENEWED // another request or tab already renewed it
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
