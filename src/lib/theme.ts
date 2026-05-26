// ─── Switchday Design System — Mobile ────────────────────────────────────────
// Mirrors the web app's CSS custom property system.
// All screens should import from here — no raw hex strings in screen files.

export const colors = {
  // ── Backgrounds ──────────────────────────────────────────────────────────
  bg:         '#E8E4DC',  // page canvas (warm taupe)
  surface:    '#FFFFFF',  // cards, modals, sheets
  surface2:   '#F0EEE9',  // input backgrounds

  // ── Borders ──────────────────────────────────────────────────────────────
  border:     'rgba(0,0,0,0.13)',  // standard dividers / input borders
  borderHair: 'rgba(0,0,0,0.07)', // hairline row separators

  // ── Brand ────────────────────────────────────────────────────────────────
  accent:       '#2B3A5C',              // navy — primary buttons, active tabs, sent bubbles
  accentSoft:   'rgba(43,58,92,0.10)',  // tinted bg for selected states
  accent2:      '#C4882A',              // amber — secondary accent
  accent2Soft:  'rgba(196,136,42,0.12)',

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary:   '#1A1A18',               // headlines, card titles
  textSecondary: 'rgba(26,26,24,0.75)',   // body text, labels
  textMuted:     'rgba(26,26,24,0.50)',   // subtitles, descriptions
  textSubtle:    'rgba(26,26,24,0.38)',   // timestamps, section caps, placeholder hints

  // ── Semantic ─────────────────────────────────────────────────────────────
  success:     '#3D8C6A',
  successSoft: 'rgba(61,140,106,0.12)',
  warning:     '#D4961E',
  warningSoft: 'rgba(212,150,30,0.12)',
  danger:      '#C04848',
  dangerSoft:  'rgba(192,72,72,0.12)',
  info:        '#3b82f6', // kept for calendar category colours
  white:       '#FFFFFF',
}

export const radius = {
  sm:   6,
  md:   12,
  lg:   16,
  xl:   20,
  full: 9999,
}

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 } as { width: number; height: number },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 } as { width: number; height: number },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  hero: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 } as { width: number; height: number },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 5,
  },
}

// Font family names loaded by @expo-google-fonts/plus-jakarta-sans
export const font = {
  regular:   'PlusJakartaSans_400Regular',
  medium:    'PlusJakartaSans_500Medium',
  semibold:  'PlusJakartaSans_600SemiBold',
  bold:      'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
}

/**
 * Shared base for button label Text styles.
 *
 * Plus Jakarta Sans has tall ascenders that create excess space at the top of
 * a Text component on iOS, making button labels appear slightly below center.
 * Setting lineHeight = fontSize removes that excess and visually re-centers
 * the glyphs within any button that uses alignItems/justifyContent: 'center'.
 *
 * Usage in StyleSheet.create:
 *   myBtnText: { ...buttonLabel, color: colors.white }
 */
export const buttonLabel = {
  fontFamily: font.semibold,
  fontWeight: '600' as const,
  fontSize:   14,
  lineHeight: 14,
}
