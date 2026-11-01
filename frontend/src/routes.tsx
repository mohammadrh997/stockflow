import { Outlet, type RouteObject } from 'react-router'

import { AuthProvider } from '@/auth/AuthProvider'
import { LoginPage } from '@/auth/LoginPage'
import { can, canEditPartners } from '@/auth/permissions'
import { RequireAccess } from '@/auth/RequireAccess'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundPage } from '@/components/NotFoundPage'
import { HomePage } from '@/features/home/HomePage'
import { NewPartnerPage } from '@/features/partners/NewPartnerPage'
import { PartnerPage } from '@/features/partners/PartnerPage'
import { PartnersPage } from '@/features/partners/PartnersPage'
import { NewProductPage } from '@/features/products/NewProductPage'
import { ProductPage } from '@/features/products/ProductPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { NewPurchaseOrderPage } from '@/features/purchase/NewPurchaseOrderPage'
import { PurchaseOrderPage } from '@/features/purchase/PurchaseOrderPage'
import { PurchaseOrdersPage } from '@/features/purchase/PurchaseOrdersPage'
import { StockPage } from '@/features/stock/StockPage'
import { WarehousePage } from '@/features/warehouses/WarehousePage'
import { WarehousesPage } from '@/features/warehouses/WarehousesPage'

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
              { path: 'products', element: <ProductsPage /> },
              {
                path: 'products/new',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'inventory', 'manager')}>
                    <NewProductPage />
                  </RequireAccess>
                ),
              },
              { path: 'products/:productId', element: <ProductPage /> },
              { path: 'partners', element: <PartnersPage /> },
              {
                path: 'partners/new',
                element: (
                  <RequireAccess allowed={canEditPartners}>
                    <NewPartnerPage />
                  </RequireAccess>
                ),
              },
              { path: 'partners/:partnerId', element: <PartnerPage /> },
              { path: 'stock', element: <StockPage /> },
              {
                path: 'purchase-orders',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'purchase')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [
                  { index: true, element: <PurchaseOrdersPage /> },
                  { path: 'new', element: <NewPurchaseOrderPage /> },
                  { path: ':orderId', element: <PurchaseOrderPage /> },
                ],
              },
              { path: 'warehouses', element: <WarehousesPage /> },
              { path: 'warehouses/:warehouseId', element: <WarehousePage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]
