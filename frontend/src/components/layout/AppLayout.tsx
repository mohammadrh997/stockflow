import { ChevronDown, LogOut, Menu, UserRound } from 'lucide-react'
import { Suspense } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'

import { useAuth } from '@/auth/useAuth'
import { PageSpinner } from '@/components/PageSpinner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { AppearanceMenu } from './AppearanceMenu'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { isInArea, sectionLinks, visibleNavItems, type SectionLink } from './navigation'

// The pages of the area that is open (Invoices / Bills...), as links in the top bar.
function SectionNav({ links, className }: { links: SectionLink[]; className?: string }) {
  const { user } = useAuth()
  const location = useLocation()
  if (links.length === 0 || !user) return null
  return (
    <nav aria-label="Section" className={cn('flex items-center gap-1', className)}>
      {links.map((link) => {
        const active = link.isActive(location, user)
        return (
          <Link
            key={link.to}
            to={link.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
              active && 'bg-muted font-medium text-foreground',
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const navItems = visibleNavItems(user)
  const { pathname } = useLocation()
  const sections = sectionLinks(user, pathname)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
        <Link to="/" className="px-5 py-4">
          <Logo />
        </Link>
        <nav aria-label="Main" className="grid gap-1 px-3">
          {navItems.map((item) => {
            const { to, label, icon: Icon } = item
            return (
              <Link
                key={to}
                to={to}
                aria-current={isInArea(item, pathname) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent',
                  isInArea(item, pathname) &&
                    'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b bg-card px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {navItems.map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to} asChild>
                  <Link to={to}>
                    <Icon />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to="/" className="md:hidden">
            <Logo />
          </Link>
          <SectionNav links={sections} className="hidden md:flex" />

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost">
                  <UserRound />
                  <span className="max-w-40 truncate">{user?.name}</span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {user?.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <UserRound />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <AppearanceMenu />
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {/* On phones the header is full, so the section links get a row of their own. */}
        <SectionNav
          links={sections}
          className="overflow-x-auto border-b bg-card px-4 py-1.5 md:hidden"
        />

        <main className="flex-1 p-4 md:p-8">
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
