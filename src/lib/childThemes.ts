/**
 * Child portal themes — mobile port of src/lib/child-themes.ts (web).
 * CSS vars are replaced with plain RN color strings.
 */

export type ThemeKey = 'default' | 'ocean' | 'sunset' | 'forest' | 'space' | 'candy'

export interface PortalTheme {
  key: ThemeKey
  label: string
  preview: string   // accent color shown in the swatch picker
  bg: string
  surface: string
  surface2: string
  border: string
  accent: string
  accentSoft: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  textSubtle: string
}

export const PORTAL_THEMES: Record<ThemeKey, PortalTheme> = {
  default: {
    key: 'default', label: 'Default', preview: '#2B3A5C',
    bg:            '#E8E4DC',
    surface:       '#FFFFFF',
    surface2:      '#F0EEE9',
    border:        'rgba(0,0,0,0.13)',
    accent:        '#2B3A5C',
    accentSoft:    'rgba(43,58,92,0.10)',
    textPrimary:   '#1A1F2E',
    textSecondary: 'rgba(26,31,46,0.65)',
    textMuted:     'rgba(26,31,46,0.45)',
    textSubtle:    'rgba(26,31,46,0.35)',
  },
  ocean: {
    key: 'ocean', label: 'Ocean', preview: '#1A8FA0',
    bg:            '#EEF7FA',
    surface:       '#FAFEFF',
    surface2:      '#E6F3F7',
    border:        'rgba(26,143,160,0.15)',
    accent:        '#1A8FA0',
    accentSoft:    'rgba(26,143,160,0.10)',
    textPrimary:   '#0D2A30',
    textSecondary: 'rgba(13,42,48,0.65)',
    textMuted:     'rgba(13,42,48,0.45)',
    textSubtle:    'rgba(13,42,48,0.35)',
  },
  sunset: {
    key: 'sunset', label: 'Sunset', preview: '#C94F3A',
    bg:            '#FAF1EE',
    surface:       '#FFFAF8',
    surface2:      '#F5E8E3',
    border:        'rgba(201,79,58,0.15)',
    accent:        '#C94F3A',
    accentSoft:    'rgba(201,79,58,0.10)',
    textPrimary:   '#2E1208',
    textSecondary: 'rgba(46,18,8,0.65)',
    textMuted:     'rgba(46,18,8,0.45)',
    textSubtle:    'rgba(46,18,8,0.35)',
  },
  forest: {
    key: 'forest', label: 'Forest', preview: '#2E7D52',
    bg:            '#EEF5EF',
    surface:       '#FAFFFA',
    surface2:      '#E2EFE4',
    border:        'rgba(46,125,82,0.15)',
    accent:        '#2E7D52',
    accentSoft:    'rgba(46,125,82,0.10)',
    textPrimary:   '#0D2416',
    textSecondary: 'rgba(13,36,22,0.65)',
    textMuted:     'rgba(13,36,22,0.45)',
    textSubtle:    'rgba(13,36,22,0.35)',
  },
  space: {
    key: 'space', label: 'Space', preview: '#9B6DFF',
    bg:            '#0D0B1E',
    surface:       '#151228',
    surface2:      '#1D1A34',
    border:        'rgba(155,109,255,0.18)',
    accent:        '#9B6DFF',
    accentSoft:    'rgba(155,109,255,0.15)',
    textPrimary:   '#F0ECFF',
    textSecondary: 'rgba(240,236,255,0.65)',
    textMuted:     'rgba(240,236,255,0.45)',
    textSubtle:    'rgba(240,236,255,0.35)',
  },
  candy: {
    key: 'candy', label: 'Candy', preview: '#C43F82',
    bg:            '#FAF0F6',
    surface:       '#FFFAFD',
    surface2:      '#F5E3EF',
    border:        'rgba(196,63,130,0.15)',
    accent:        '#C43F82',
    accentSoft:    'rgba(196,63,130,0.10)',
    textPrimary:   '#2A0818',
    textSecondary: 'rgba(42,8,24,0.65)',
    textMuted:     'rgba(42,8,24,0.45)',
    textSubtle:    'rgba(42,8,24,0.35)',
  },
}

export const THEME_KEYS = Object.keys(PORTAL_THEMES) as ThemeKey[]

export function getPortalTheme(key: string | null | undefined): PortalTheme {
  return PORTAL_THEMES[(key as ThemeKey) ?? 'default'] ?? PORTAL_THEMES.default
}
