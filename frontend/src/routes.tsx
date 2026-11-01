import { Outlet, type RouteObject } from 'react-router'

import { AuthProvider } from '@/auth/AuthProvider'
import { LoginPage } from '@/auth/LoginPage'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundPage } from '@/components/NotFoundPage'
import { HomePage } from '@/features/home/HomePage'

// AuthProvider sits inside the router so it and the pages it wraps can use navigation hooks.
export const routes: RouteObject[] = [
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]
