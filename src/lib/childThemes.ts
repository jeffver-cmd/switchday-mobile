/**
 * Child portal themes — mobile port of src/lib/child-themes.ts (web).
 * CSS vars are replaced with plain RN color strings.
 */

export type ThemeKey = 'default' | 'ocean' | 'sunset' | 'forest' | 'candy' | 'autumn' | 'lavender' | 'berry' | 'rose' | 'mint' | 'sky' | 'sunshine' | 'space' | 'ember' | 'midnight'

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
  autumn: {
    key: 'autumn', label: 'Autumn', preview: '#C46028',
    bg:            '#FAF3EB',
    surface:       '#FFFAF4',
    surface2:      '#F5E6D0',
    border:        'rgba(196,96,40,0.15)',
    accent:        '#C46028',
    accentSoft:    'rgba(196,96,40,0.10)',
    textPrimary:   '#2C1505',
    textSecondary: 'rgba(44,21,5,0.65)',
    textMuted:     'rgba(44,21,5,0.45)',
    textSubtle:    'rgba(44,21,5,0.35)',
  },
  lavender: {
    key: 'lavender', label: 'Lavender', preview: '#7E57E4',
    bg:            '#F5F2FF',
    surface:       '#FDFCFF',
    surface2:      '#EDE6FF',
    border:        'rgba(126,87,228,0.15)',
    accent:        '#7E57E4',
    accentSoft:    'rgba(126,87,228,0.10)',
    textPrimary:   '#1A0A3C',
    textSecondary: 'rgba(26,10,60,0.65)',
    textMuted:     'rgba(26,10,60,0.45)',
    textSubtle:    'rgba(26,10,60,0.35)',
  },
  berry: {
    key: 'berry', label: 'Berry', preview: '#9B2450',
    bg:            '#FDF0F4',
    surface:       '#FFFAFC',
    surface2:      '#F5D8E6',
    border:        'rgba(155,36,80,0.15)',
    accent:        '#9B2450',
    accentSoft:    'rgba(155,36,80,0.10)',
    textPrimary:   '#2A0810',
    textSecondary: 'rgba(42,8,16,0.65)',
    textMuted:     'rgba(42,8,16,0.45)',
    textSubtle:    'rgba(42,8,16,0.35)',
  },
  mint: {
    key: 'mint', label: 'Mint', preview: '#10AC80',
    bg:            '#F0FDF8',
    surface:       '#FAFFFD',
    surface2:      '#D6F8ED',
    border:        'rgba(16,172,128,0.15)',
    accent:        '#10AC80',
    accentSoft:    'rgba(16,172,128,0.10)',
    textPrimary:   '#042F1E',
    textSecondary: 'rgba(4,47,30,0.65)',
    textMuted:     'rgba(4,47,30,0.45)',
    textSubtle:    'rgba(4,47,30,0.35)',
  },
  ember: {
    key: 'ember', label: 'Ember', preview: '#F97316',
    bg:            '#100A02',
    surface:       '#1A1008',
    surface2:      '#231604',
    border:        'rgba(249,115,22,0.18)',
    accent:        '#F97316',
    accentSoft:    'rgba(249,115,22,0.15)',
    textPrimary:   '#FFF5E6',
    textSecondary: 'rgba(255,245,230,0.65)',
    textMuted:     'rgba(255,245,230,0.45)',
    textSubtle:    'rgba(255,245,230,0.35)',
  },
  sunshine: {
    key: 'sunshine', label: 'Sunshine', preview: '#D4920A',
    bg:            '#FFFCEB',
    surface:       '#FFFEF6',
    surface2:      '#FEF3C2',
    border:        'rgba(212,146,10,0.15)',
    accent:        '#D4920A',
    accentSoft:    'rgba(212,146,10,0.10)',
    textPrimary:   '#1C1100',
    textSecondary: 'rgba(28,17,0,0.65)',
    textMuted:     'rgba(28,17,0,0.45)',
    textSubtle:    'rgba(28,17,0,0.35)',
  },
  rose: {
    key: 'rose', label: 'Rose', preview: '#C9637A',
    bg:            '#FEF5F7',
    surface:       '#FFFAFE',
    surface2:      '#FFE8EE',
    border:        'rgba(201,99,122,0.15)',
    accent:        '#C9637A',
    accentSoft:    'rgba(201,99,122,0.10)',
    textPrimary:   '#2A080E',
    textSecondary: 'rgba(42,8,14,0.65)',
    textMuted:     'rgba(42,8,14,0.45)',
    textSubtle:    'rgba(42,8,14,0.35)',
  },
  sky: {
    key: 'sky', label: 'Sky', preview: '#3B82F6',
    bg:            '#EFF6FF',
    surface:       '#FAFEFF',
    surface2:      '#DBEAFE',
    border:        'rgba(59,130,246,0.15)',
    accent:        '#3B82F6',
    accentSoft:    'rgba(59,130,246,0.10)',
    textPrimary:   '#0A1628',
    textSecondary: 'rgba(10,22,40,0.65)',
    textMuted:     'rgba(10,22,40,0.45)',
    textSubtle:    'rgba(10,22,40,0.35)',
  },
  midnight: {
    key: 'midnight', label: 'Midnight', preview: '#60B4FF',
    bg:            '#060B18',
    surface:       '#0C1428',
    surface2:      '#131F3C',
    border:        'rgba(96,180,255,0.18)',
    accent:        '#60B4FF',
    accentSoft:    'rgba(96,180,255,0.15)',
    textPrimary:   '#E8F4FF',
    textSecondary: 'rgba(232,244,255,0.65)',
    textMuted:     'rgba(232,244,255,0.45)',
    textSubtle:    'rgba(232,244,255,0.35)',
  },
}

// Explicit order — 5 per row, dark themes grouped as the last 3 of row 3
export const THEME_KEYS: ThemeKey[] = [
  // Row 1
  'default', 'ocean', 'sunset', 'forest', 'candy',
  // Row 2
  'autumn', 'lavender', 'berry', 'rose', 'mint',
  // Row 3 — sky + sunshine, then darks together
  'sky', 'sunshine', 'space', 'ember', 'midnight',
]

export function getPortalTheme(key: string | null | undefined): PortalTheme {
  return PORTAL_THEMES[(key as ThemeKey) ?? 'default'] ?? PORTAL_THEMES.default
}
