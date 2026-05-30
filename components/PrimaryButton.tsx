/**
 * PrimaryButton — premium navy button with gradient + scale + haptic.
 *
 * Use for any primary call-to-action (+ Log, Propose, Save, etc.).
 * Drop-in replacement for the plain TouchableOpacity + navy background pattern.
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

export function PrimaryButton({ label, onPress, disabled = false, style, textStyle, small = false, leftIcon }: PrimaryButtonProps) {
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
          colors={disabled ? ['#8A9BB8', '#6B7D9E'] : ['#3D506A', '#243558']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.btn, small && styles.btnSmall, !!leftIcon && styles.btnRow]}
        >
          {leftIcon && <View style={styles.iconWrap}>{leftIcon}</View>}
          <Text style={[styles.label, small && styles.labelSmall, textStyle]}>{label}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  shadow: {
    // Color-matched shadow — navy glow instead of generic black
    shadowColor: '#1A2640',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
    borderRadius: radius.md,
  },
  disabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  btn: {
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle top-edge highlight to simulate light catching the surface
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  btnSmall: {
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 36,
    justifyContent: 'center',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { marginRight: 6 },
  label: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: font.bold,
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  labelSmall: {
    fontSize: 13,
    lineHeight: 20,
  },
})
