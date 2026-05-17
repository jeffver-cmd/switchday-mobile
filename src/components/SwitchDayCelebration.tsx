/**
 * SwitchDayCelebration — mobile port of the web SwitchDayCelebration.
 *
 * Uses React Native's built-in Animated API (NOT react-native-reanimated)
 * so it works in Expo Go without a custom dev build.
 *
 * Visual layers:
 *   - Warm orange card with dark-amber → bright-orange color wash on entry
 *   - 5 randomly positioned twinkling ✦ / ◆ art-deco stars
 *   - Dismiss: scale explosion (1 → 1.06 → 22) + fade out
 *   - Semi-opaque dark backdrop fades in / out
 *
 * Haptics:
 *   1. Card appears     → notificationAsync(Success)
 *   2. "Got it" tapped  → impactAsync(Medium)
 *   3. Card explodes    → impactAsync(Heavy) at +100 ms
 *
 * Once-per-day guard is handled by the caller (dashboard.tsx).
 * On dismiss this component writes the seen-key via expo-secure-store.
 */

import React, { useRef, useState, useEffect, useMemo } from 'react'
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import * as SecureStore from 'expo-secure-store'
import { font, radius } from '@/lib/theme'

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  switchDate: string    // YYYY-MM-DD
  onDismiss: () => void
}

interface StarConfig {
  top: number
  left: number
  size: number
  delay: number
  dur: number
  char: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function seenKey(dateStr: string) {
  return `switchday:celebration:${dateStr}`
}

function makeStars(): StarConfig[] {
  return Array.from({ length: 5 }, () => ({
    top:   5  + Math.random() * 78,
    left:  5  + Math.random() * 78,
    size:  Math.round(11 + Math.random() * 9),
    delay: Math.random() * 1200,
    dur:   2200 + Math.random() * 1000,
    char:  Math.random() > 0.5 ? '✦' : '◆',
  }))
}

// ─── Star ─────────────────────────────────────────────────────────────────────

function Star({ config }: { config: StarConfig }) {
  const opacity = useRef(new Animated.Value(0.2)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(opacity, {
          toValue: 0.78,
          duration: config.dur,
          useNativeDriver: false,
          easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(opacity, {
          toValue: 0.18,
          duration: config.dur,
          useNativeDriver: false,
          easing: Easing.inOut(Easing.sin),
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.Text
      style={[
        styles.star,
        {
          top:      `${config.top}%` as any,
          left:     `${config.left}%` as any,
          fontSize: config.size,
          opacity,
        },
      ]}
    >
      {config.char}
    </Animated.Text>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SwitchDayCelebration({ switchDate, onDismiss }: Props) {
  const [dismissing, setDismissing] = useState(false)

  const stars = useMemo(makeStars, [])

  const dateLabel = useMemo(() =>
    new Date(switchDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }),
  [switchDate])

  // ── Animated values ──────────────────────────────────────────────────────

  // Backdrop — opacity only; safe for native driver
  const backdropOpacity = useRef(new Animated.Value(0)).current

  // Card — color + scale + opacity; useNativeDriver: false for color
  const cardColorPct = useRef(new Animated.Value(0)).current
  const cardScale    = useRef(new Animated.Value(0.93)).current
  const cardOpacity  = useRef(new Animated.Value(0)).current

  // Interpolated card background color (color wash entrance)
  const cardBg = cardColorPct.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(180, 82, 12, 0.97)', 'rgba(255, 120, 45, 0.97)'],
  })

  // ── Entry animations ─────────────────────────────────────────────────────

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})

    Animated.parallel([
      // Backdrop
      Animated.timing(backdropOpacity, {
        toValue: 1, duration: 350, useNativeDriver: false,
      }),
      // Card slide-in with slight overshoot
      Animated.spring(cardScale, {
        toValue: 1, useNativeDriver: false,
        speed: 14, bounciness: 6,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1, duration: 280, useNativeDriver: false,
      }),
      // Color wash
      Animated.timing(cardColorPct, {
        toValue: 1, duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start()
  }, [])

  // ── Dismiss ──────────────────────────────────────────────────────────────

  function handleDismiss() {
    if (dismissing) return
    setDismissing(true)

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
    }, 100)

    // Backdrop fades out
    Animated.delay(200)
    Animated.timing(backdropOpacity, {
      toValue: 0, duration: 650, delay: 200, useNativeDriver: false,
    }).start()

    // Card: bounce up then explode
    Animated.sequence([
      Animated.timing(cardScale, {
        toValue: 1.06, duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(cardScale, {
        toValue: 22, duration: 860,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start()

    Animated.timing(cardOpacity, {
      toValue: 0, duration: 700, delay: 140,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        SecureStore.setItemAsync(seenKey(switchDate), '1').catch(() => {})
        onDismiss()
      }
    })
  }

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
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />

      {/* Centering layer */}
      <View style={styles.centeredContainer} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              opacity: cardOpacity,
              transform: [{ scale: cardScale }],
            },
          ]}
        >
          {/* Twinkling stars */}
          {!dismissing && stars.map((star, i) => (
            <Star key={i} config={star} />
          ))}

          {/* Content */}
          <View style={styles.content}>

            <Text style={styles.heading}>Switch Day</Text>

            <Text style={styles.dateLabel}>{dateLabel}</Text>

            <View style={styles.divider} />

            <Text style={styles.tagline}>Today is the handoff.</Text>

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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },

  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  card: {
    width: '100%',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 44,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.32,
    shadowRadius: 40,
    elevation: 20,
  },

  star: {
    position: 'absolute',
    color: 'rgba(255, 255, 255, 0.70)',
    lineHeight: 20,
  },

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
