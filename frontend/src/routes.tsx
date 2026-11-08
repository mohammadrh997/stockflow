import { lazy, type ComponentType } from 'react'
import { Outlet, type RouteObject } from 'react-router'

import { AuthProvider } from '@/auth/AuthProvider'
import { LoginPage } from '@/auth/LoginPage'
import { can, canEditPartners } from '@/auth/permissions'
import { RequireAccess } from '@/auth/RequireAccess'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundPage } from '@/components/NotFoundPage'
import { RouteErrorPage } from '@/components/RouteErrorPage'
import { HomePage } from '@/features/home/HomePage'

// Feature pages load on demand, so the first page only downloads what it needs.
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const NewPartnerPage = lazyPage(
  () => import('@/features/partners/NewPartnerPage'),
  'NewPartnerPage',
)
const PartnerPage = lazyPage(() => import('@/features/partners/PartnerPage'), 'PartnerPage')
const PartnersPage = lazyPage(() => import('@/features/partners/PartnersPage'), 'PartnersPage')
const NewProductPage = lazyPage(
  () => import('@/features/products/NewProductPage'),
  'NewProductPage',
)
const ProductPage = lazyPage(() => import('@/features/products/ProductPage'), 'ProductPage')
const ProductsPage = lazyPage(() => import('@/features/products/ProductsPage'), 'ProductsPage')
const NewPurchaseOrderPage = lazyPage(
  () => import('@/features/purchase/NewPurchaseOrderPage'),
  'NewPurchaseOrderPage',
)
const ProfilePage = lazyPage(() => import('@/features/profile/ProfilePage'), 'ProfilePage')
const PurchaseOrderPage = lazyPage(
  () => import('@/features/purchase/PurchaseOrderPage'),
  'PurchaseOrderPage',
)
const PurchaseOrdersPage = lazyPage(
  () => import('@/features/purchase/PurchaseOrdersPage'),
  'PurchaseOrdersPage',
)
const NewSalesOrderPage = lazyPage(
  () => import('@/features/sales/NewSalesOrderPage'),
  'NewSalesOrderPage',
)
const SalesOrderPage = lazyPage(() => import('@/features/sales/SalesOrderPage'), 'SalesOrderPage')
const SalesOrdersPage = lazyPage(
  () => import('@/features/sales/SalesOrdersPage'),
  'SalesOrdersPage',
)
const StockPage = lazyPage(() => import('@/features/stock/StockPage'), 'StockPage')
const InvoicesPage = lazyPage(() => import('@/features/invoices/InvoicesPage'), 'InvoicesPage')
const NewAdjustmentPage = lazyPage(
  () => import('@/features/transfers/NewAdjustmentPage'),
  'NewAdjustmentPage',
)
const NewInternalTransferPage = lazyPage(
  () => import('@/features/transfers/NewInternalTransferPage'),
  'NewInternalTransferPage',
)
const TransferPage = lazyPage(() => import('@/features/transfers/TransferPage'), 'TransferPage')
const TransfersPage = lazyPage(() => import('@/features/transfers/TransfersPage'), 'TransfersPage')
const NewUserPage = lazyPage(() => import('@/features/users/NewUserPage'), 'NewUserPage')
const UserPage = lazyPage(() => import('@/features/users/UserPage'), 'UserPage')
const UsersPage = lazyPage(() => import('@/features/users/UsersPage'), 'UsersPage')
const WarehousePage = lazyPage(() => import('@/features/warehouses/WarehousePage'), 'WarehousePage')
const WarehousesPage = lazyPage(
  () => import('@/features/warehouses/WarehousesPage'),
  'WarehousesPage',
)

// AuthProvider sits inside the router so it and the pages it wraps can use navigation hooks.
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
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
              { path: 'profile', element: <ProfilePage /> },
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
              {
                path: 'sales-orders',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'sales')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [
                  { index: true, element: <SalesOrdersPage /> },
                  { path: 'new', element: <NewSalesOrderPage /> },
                  { path: ':orderId', element: <SalesOrderPage /> },
                ],
              },
              {
                path: 'invoices',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'sales') || can(user, 'purchase')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [{ index: true, element: <InvoicesPage /> }],
              },
              {
                path: 'transfers',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'inventory')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [
                  { index: true, element: <TransfersPage /> },
                  { path: 'internal', element: <NewInternalTransferPage /> },
                  {
                    path: 'adjustment',
                    element: (
                      <RequireAccess allowed={(user) => can(user, 'inventory', 'manager')}>
                        <NewAdjustmentPage />
                      </RequireAccess>
                    ),
                  },
                  { path: ':transferId', element: <TransferPage /> },
                ],
              },
              { path: 'warehouses', element: <WarehousesPage /> },
              { path: 'warehouses/:warehouseId', element: <WarehousePage /> },
              {
                path: 'users',
                element: (
                  <RequireAccess allowed={(user) => can(user, 'admin')}>
                    <Outlet />
                  </RequireAccess>
                ),
                children: [
                  { index: true, element: <UsersPage /> },
                  { path: 'new', element: <NewUserPage /> },
                  { path: ':userId', element: <UserPage /> },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]
