import { Palette } from 'lucide-react'

import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ACCENTS,
  setAppearance,
  useAppearance,
  type Accent,
  type ThemeMode,
} from '@/lib/appearance'

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Same as system' },
]

// A submenu of the user menu: light/dark theme and the accent colour.
export function AppearanceMenu() {
  const { mode, accent } = useAppearance()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette />
        Appearance
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuLabel className="text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => setAppearance({ mode: value as ThemeMode })}
        >
          {MODES.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground">Accent colour</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={accent}
          onValueChange={(value) => setAppearance({ accent: value as Accent })}
        >
          {ACCENTS.map((option) => (
            <DropdownMenuRadioItem
              key={option.id}
              value={option.id}
              onSelect={(event) => event.preventDefault()}
            >
              <span
                aria-hidden
                className="size-3 rounded-full"
                style={{ backgroundColor: option.swatch }}
              />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
