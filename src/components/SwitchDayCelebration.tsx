/**
 * SwitchDayCelebration — mobile port of the web SwitchDayCelebration.
 *
 * Visual layers (web parity):
 *   - Warm orange card with color-wash entrance (dark amber → bright orange)
 *   - 5 randomly positioned twinkling ✦ / ◆ art-deco stars
 *   - Dismiss: Framer-style scale explosion (1 → 1.06 → 22) + fade out
 *   - Semi-opaque dark backdrop fades in/out
 *
 * Skipped from web version:
 *   - Spinning conic-gradient border comet (no conic-gradient in RN)
 *
 * Haptics (3 moments):
 *   1. Card appears     → notificationAsync(Success)
 *   2. "Got it" tapped  → impactAsync(Medium)
 *   3. Card explodes    → impactAsync(Heavy) at +100ms
 *
 * Once-per-day guard: caller is responsible (dashboard.tsx reads SecureStore
 * before rendering this component). On dismiss this component writes the
 * seen-key so the dashboard won't show it again today.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  runOnJS,
  Easing,
  interpolateColor,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import * as SecureStore from 'expo-secure-store'
import { font, radius } from '@/lib/theme'

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  switchDate: string    // YYYY-MM-DD
  onDismiss: () => void
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function seenKey(dateStr: string) {
  return `switchday:celebration:${dateStr}`
}

interface StarConfig {
  top: number
  left: number
  size: number
  delay: number
  dur: number
  char: string
}

function makeStars(): StarConfig[] {
  return Array.from({ length: 5 }, () => ({
    top:   5  + Math.random() * 78,
    left:  5  + Math.random() * 78,
    size:  Math.round(11 + Math.random() * 9),
    delay: Math.random() * 1200,       // ms
    dur:   2200 + Math.random() * 1000, // ms per half-cycle
    char:  Math.random() > 0.5 ? '✦' : '◆',
  }))
}

// ─── star component ───────────────────────────────────────────────────────────

function Star({ config }: { config: StarConfig }) {
  const opacity = useSharedValue(0.2)

  useEffect(() => {
    opacity.value = withDelay(
      config.delay,
      withRepeat(
        withSequence(
          withTiming(0.78, { duration: config.dur }),
          withTiming(0.18, { duration: config.dur }),
        ),
        -1,
        false,
      ),
    )
  }, [])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.Text
      style={[
        styles.star,
        { top: `${config.top}%`, left: `${config.left}%`, fontSize: config.size },
        style,
      ]}
    >
      {config.char}
    </Animated.Text>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SwitchDayCelebration({ switchDate, onDismiss }: Props) {
  const [dismissing, setDismissing] = useState(false)

  // Memoised star configs — stable across renders
  const stars = useMemo(makeStars, [])

  const dateLabel = useMemo(() =>
    new Date(switchDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }),
  [switchDate])

  // ── Animated values ──────────────────────────────────────────────────────

  // Backdrop
  const backdropOpacity = useSharedValue(0)

  // Card
  const cardColorPct = useSharedValue(0)   // 0 = dark amber, 1 = bright orange
  const cardScale    = useSharedValue(0.93)
  const cardOpacity  = useSharedValue(0)

  // ── Entry animations on mount ────────────────────────────────────────────

  useEffect(() => {
    // Haptic on appear
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})

    // Backdrop fade in
    backdropOpacity.value = withTiming(1, { duration: 350 })

    // Card entrance
    cardScale.value   = withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.4)) })
    cardOpacity.value = withTiming(1, { duration: 280 })

    // Color wash: dark amber → bright orange over 1.4s
    cardColorPct.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) })
  }, [])

  // ── Dismiss ──────────────────────────────────────────────────────────────

  function handleAnimationComplete() {
    SecureStore.setItemAsync(seenKey(switchDate), '1').catch(() => {})
    onDismiss()
  }

  function handleDismiss() {
    if (dismissing) return
    setDismissing(true)

    // Haptics: medium on tap, heavy as card begins to explode
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
    }, 100)

    // Backdrop fades out
    backdropOpacity.value = withDelay(200, withTiming(0, { duration: 650 }))

    // Card scale explosion then complete
    cardScale.value = withSequence(
      withTiming(1.06, { duration: 240, easing: Easing.out(Easing.quad) }),
      withTiming(22,   { duration: 860, easing: Easing.in(Easing.quad) }),
    )
    cardOpacity.value = withDelay(
      140,
      withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) }, (finished) => {
        'worklet'
        if (finished) runOnJS(handleAnimationComplete)()
      }),
    )
  }

  // ── Animated styles ──────────────────────────────────────────────────────

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
    backgroundColor: interpolateColor(
      cardColorPct.value,
      [0, 1],
      ['rgba(180, 82, 12, 0.97)', 'rgba(255, 120, 45, 0.97)'],
    ),
  }))

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal
      transparent
      animationType="none"
      statusBarTranslucent
      visible
      onRequestClose={handleDismiss}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]} />

      {/* Centered content */}
      <View style={styles.centeredContainer} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          {/* Stars */}
          {!dismissing && stars.map((star, i) => (
            <Star key={i} config={star} />
          ))}

          {/* Content */}
          <View style={styles.content}>

            {/* Heading */}
            <Text style={styles.heading}>Switch Day</Text>

            {/* Date */}
            <Text style={styles.dateLabel}>{dateLabel}</Text>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Tagline */}
            <Text style={styles.tagline}>Today is the handoff.</Text>

            {/* Dismiss button */}
            <TouchableOpacity
              onPress={handleDismiss}
              disabled={dismissing}
              activeOpacity={0.88}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Got it</Text>
            </TouchableOpacity>

          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Backdrop — absolutely fills the screen behind the card
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },

  // Full-screen centering layer (no background — backdrop is separate)
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Card
  card: {
    width: '100%',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 44,
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.32,
    shadowRadius: 40,
    elevation: 20,
  },

  // Star (absolutely positioned within card)
  star: {
    position: 'absolute',
    color: 'rgba(255, 255, 255, 0.70)',
    lineHeight: 20,
  },

  // Content wrapper — sits above stars via zIndex
  content: {
    zIndex: 1,
    alignItems: 'center',
  },

  heading: {
    fontSize: 38,
    fontWeight: '800',
    fontFamily: font.extrabold,
    color: '#ffffff',
    letterSpacing: -1.5,
    lineHeight: 42,
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(100, 50, 0, 0.28)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },

  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: font.medium,
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
    marginBottom: 22,
  },

  divider: {
    width: 40,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    marginBottom: 22,
  },

  tagline: {
    fontSize: 15,
    fontFamily: font.regular,
    color: 'rgba(255, 255, 255, 0.82)',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 36,
  },

  button: {
    paddingVertical: 13,
    paddingHorizontal: 48,
    borderRadius: radius.full,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 6,
  },

  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: font.bold,
    color: '#B36A00',
    letterSpacing: 0.2,
  },
})
