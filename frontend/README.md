# StockFlow frontend

React + TypeScript + Vite UI for the StockFlow inventory API in `../backend`.

## Develop

Requires Node LTS. Run every command from `frontend/`.

```bash
cp .env.example .env
npm install
npm run dev
```

The app runs on http://localhost:5173 and talks to the API at `VITE_API_URL`
(`http://localhost:8000` by default). The backend must allow that origin:
`CORS_ORIGINS=["http://localhost:5173"]` in `backend/.env`.

Every `VITE_` variable ends up in the public JavaScript bundle, so never put a secret in one.

## Scripts

| Script                            | What it does                                                               |
| --------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                     | Dev server with hot reload                                                 |
| `npm run build`                   | Type check and build into `dist/`                                          |
| `npm run lint`                    | ESLint                                                                     |
| `npm run format` / `format:check` | Prettier                                                                   |
| `npm run typecheck`               | TypeScript, no output                                                      |
| `npm test`                        | Vitest once (`npm run test:watch` to keep it running)                      |
| `npm run gen:api`                 | Regenerate `src/api/schema.d.ts` from `http://localhost:8000/openapi.json` |
| `npm run gen:api:prod`            | The same, from the deployed API                                            |

`src/api/schema.d.ts` is generated: commit it, never edit it by hand. Regenerate it whenever
the backend's API changes.

## How it is organised

- `src/api/`: the typed client, the generated schema, error handling and the wake-up tracking.
- `src/auth/`: login and session, the current user, `can()` and the route guards.
- `src/components/`: shared pieces (tables, pickers, dialogs) and `ui/` from shadcn.
- `src/features/<area>/`: each area's pages, forms and query hooks (`queries.ts`).
- `src/routes.tsx`: every route; feature pages are loaded on demand.

Server data lives in TanStack Query only. Query keys follow `['products', params]` for lists and
`['product', id]` for one record. Permissions go through `can(user, module, level)` in
`src/auth/permissions.ts`; the server still decides.

## Deploy (Render static site)

`../render.yaml` describes the site as a Blueprint. To set it up in the dashboard instead:

| Setting            | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| Root directory     | `frontend`                                                                |
| Build command      | `npm ci && npm run build`                                                 |
| Publish directory  | `dist`                                                                    |
| Environment        | `VITE_API_URL=https://stockflow-api-c9w7.onrender.com`, `NODE_VERSION=26` |
| Redirects/Rewrites | Rewrite `/*` to `/index.html`                                             |
| Build filter       | `frontend/**`                                                             |

The API must allow the site's origin: add its URL (e.g. `https://stockflow-web.onrender.com`)
to `CORS_ORIGINS` on the API service.
