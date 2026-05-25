/**
 * Switchday logo mark + wordmark for React Native.
 * Matches the web Logo component exactly — navy gradient box with
 * amber top arrow and white bottom arrow.
 */
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Rect, Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { colors, font } from '@/lib/theme'

interface Props {
  /** Size of the icon box in dp. Wordmark scales proportionally. */
  size?: number
}

export function SwitchdayIcon({ size = 44 }: { size?: number }) {
  const rx = size * 0.25  // ~10px at size=44
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#384F78" />
          <Stop offset="100%" stopColor="#1E2B44" />
        </LinearGradient>
        <LinearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="white" stopOpacity={0.20} />
          <Stop offset="55%" stopColor="white" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {/* Background */}
      <Rect width="36" height="36" rx={rx} fill="url(#bg)" />
      {/* Highlight */}
      <Rect width="36" height="36" rx={rx} fill="url(#hl)" />
      {/* Top arrow — amber */}
      <Path
        d="M14.5,10.5 L12,13 C12,10 24,10 24,13 M12,13 L14.5,15.5"
        stroke="#E8A83E"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Bottom arrow — white */}
      <Path
        d="M21.5,20.5 L24,23 C24,26 12,26 12,23 M24,23 L21.5,25.5"
        stroke="white"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

export default function SwitchdayLogo({ size = 44 }: Props) {
  const textSize = Math.round(size * 0.64)  // 28px at size=44
  return (
    <View style={styles.row}>
      <SwitchdayIcon size={size} />
      <Text style={[styles.wordmark, { fontSize: textSize }]}>Switchday</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wordmark: {
    fontWeight: '700',
    fontFamily: font.bold,
    color: colors.accent,
    letterSpacing: -0.4,
  },
})
