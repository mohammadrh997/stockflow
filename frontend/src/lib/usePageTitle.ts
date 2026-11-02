import { useEffect } from 'react'

const APP_NAME = 'StockFlow'

// Names the browser tab after the page, e.g. "PO00007 · StockFlow".
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
