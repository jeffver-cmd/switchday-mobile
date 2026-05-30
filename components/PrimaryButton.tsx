/**
 * PrimaryButton — premium navy button with gradient + scale + haptic.
 *
 * Use for any primary call-to-action (+ Log, Propose, Save, etc.).
 * Drop-in replacement for the plain TouchableOpacity + navy background pattern.
 *
 * small prop  → fixed 36px header button with minWidth so the '+' stays
 *               at the same screen position across all tab screens.
 */
import { Animated, Pressable, StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native'
import { ReactNode, useRef } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { colors, font, radius } from '../src/lib/theme'

interface PrimaryButtonProps {
  label: string
  onPress: () => void
  disabled?: boolean
  style?: ViewStyle
  textStyle?: TextStyle
  small?: boolean
  leftIcon?: ReactNode
}

const GRADIENT_ON: readonly [string, string]  = ['#3D506A', '#243558']
const GRADIENT_OFF: readonly [string, string] = ['#8A9BB8', '#6B7D9E']

export function PrimaryButton({
  label, onPress, disabled = false, style, textStyle, small = false, leftIcon,
}: PrimaryButtonProps) {
  const scale = useRef(new Animated.Value(1)).current

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 300, bounciness: 4 }).start()
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 300, bounciness: 4 }).start()
  }
  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onPress()
  }

  const gradColors = disabled ? GRADIENT_OFF : GRADIENT_ON

  if (small) {
    return (
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        style={[styles.shadowSmall, style, disabled && styles.disabled]}
      >
        <Animated.View style={[styles.animSmall, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={gradColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={leftIcon ? styles.gradSmallRow : styles.gradSmall}
          >
            {leftIcon && <View style={styles.iconWrap}>{leftIcon}</View>}
            <Text style={[styles.labelSmall, textStyle]}>{label}</Text>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      style={[styles.shadow, style, disabled && styles.disabled]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={gradColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={leftIcon ? styles.gradRow : styles.grad}
        >
          {leftIcon && <View style={styles.iconWrap}>{leftIcon}</View>}
          <Text style={[styles.label, textStyle]}>{label}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  )
}

const HIGHLIGHT_BORDER = {
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: 'rgba(255,255,255,0.18)',
} as const

const SHADOW_BASE = {
  shadowColor: '#1A2640',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 5,
} as const

const styles = StyleSheet.create({
  // ── Full-size ──────────────────────────────────────────────────────────────
  shadow: {
    ...SHADOW_BASE,
    borderRadius: radius.md,
  },
  grad: {
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    ...HIGHLIGHT_BORDER,
  },
  gradRow: {
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...HIGHLIGHT_BORDER,
  },
  label: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: font.bold,
    letterSpacing: 0.3,
    lineHeight: 14,
  },

  // ── Small (header buttons) ─────────────────────────────────────────────────
  // minWidth ensures the '+' sits at the same x position on every screen
  // regardless of what word follows it.
  shadowSmall: {
    ...SHADOW_BASE,
    borderRadius: radius.full,
    height: 40,
    minWidth: 90,
    alignSelf: 'center',
  },
  animSmall: {
    height: 40,
    minWidth: 90,
  },
  gradSmall: {
    height: 40,
    minWidth: 90,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...HIGHLIGHT_BORDER,
  },
  gradSmallRow: {
    height: 40,
    minWidth: 90,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...HIGHLIGHT_BORDER,
  },
  labelSmall: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: font.bold,
    letterSpacing: 0.3,
    lineHeight: 13,
  },

  // ── Shared ─────────────────────────────────────────────────────────────────
  disabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  iconWrap: { marginRight: 6 },
})
