import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { supabase } from '../supabase'
import { getPortalTheme, PortalTheme, ThemeKey, PORTAL_THEMES } from '../childThemes'

// ─── types ───────────────────────────────────────────────────────────────────

export interface PortalProfile {
  id: string
  displayName: string
  initials: string
  avatarEmoji: string | null
  color: string
}

export interface PortalContextValue {
  theme: PortalTheme
  profile: PortalProfile | null
  /** Call after saving a new theme key to immediately re-apply. */
  setThemeKey: (key: ThemeKey) => void
  /** Reload profile + theme from the database. */
  reload: () => void
}

// ─── context ─────────────────────────────────────────────────────────────────

const PortalContext = createContext<PortalContextValue>({
  theme:       PORTAL_THEMES.default,
  profile:     null,
  setThemeKey: () => {},
  reload:      () => {},
})

// ─── provider ────────────────────────────────────────────────────────────────

export function PortalProvider({ children }: { children: ReactNode }) {
  const [theme,   setTheme]   = useState<PortalTheme>(PORTAL_THEMES.default)
  const [profile, setProfile] = useState<PortalProfile | null>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, initials, avatar_emoji, color, theme')
      .eq('id', session.user.id)
      .maybeSingle()

    if (!data) return

    setProfile({
      id:           data.id,
      displayName:  data.display_name ?? '',
      initials:     data.initials     ?? '',
      avatarEmoji:  data.avatar_emoji ?? null,
      color:        data.color        ?? '#6b7280',
    })
    setTheme(getPortalTheme(data.theme))
  }, [])

  useEffect(() => { load() }, [load])

  function setThemeKey(key: ThemeKey) {
    setTheme(getPortalTheme(key))
  }

  return (
    <PortalContext.Provider value={{ theme, profile, setThemeKey, reload: load }}>
      {children}
    </PortalContext.Provider>
  )
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function usePortal() {
  return useContext(PortalContext)
}
