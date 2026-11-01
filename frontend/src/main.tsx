import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'

import { createQueryClient } from '@/api/queryClient'
import { App } from './App'
import { routes } from './routes'
import './index.css'

const queryClient = createQueryClient()
const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
)
