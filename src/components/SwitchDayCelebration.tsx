/**
 * SwitchDayCelebration — mobile port of the web SwitchDayCelebration.
 *
 * Color scheme matches the web `animate-color-wash` keyframes:
 *   navy → deep-blue → teal → teal-green → forest-green (3.5s)
 *   then pulses forest-green ↔ navy indefinitely
 *
 * Architecture:
 *   Outer Animated.View — scale + opacity, useNativeDriver: true (native thread)
 *   Inner Animated.View — backgroundColor only, useNativeDriver: false (JS thread)
 * Splitting drivers across separate view nodes avoids the "can't mix drivers"
 * constraint while keeping the entrance animation on the fast native thread.
 *
 * Haptics:
 *   1. Card appears     → notificationAsync(Success)
 *   2. "Got it" tapped  → impactAsync(Medium)
 *   3. Card explodes    → impactAsync(Heavy) at +100 ms
 */

import React, { useRef, useState, useEffect, useMemo } from 'react'
import {
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import * as SecureStore from 'expo-secure-store'
import { font, radius } from '@/lib/theme'

// ─── colour constants (matches globals.css color-wash keyframes) ───────────────

const C_NAVY    = 'rgba( 43,  58,  92, 0.97)'
const C_DBLUE   = 'rgba( 35,  72, 108, 0.97)'
const C_TEAL    = 'rgba( 30,  95, 107, 0.97)'
const C_TGREEN  = 'rgba( 40, 112,  95, 0.97)'
const C_FGREEN  = 'rgba( 45, 120,  90, 0.97)'

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  switchDate: string      // YYYY-MM-DD
  checklistItems?: string[]
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
          toValue: 0.78, duration: config.dur,
          useNativeDriver: true, easing: Easing.inOut(Easing.sin),
        }),
        Animated.timing(opacity, {
          toValue: 0.18, duration: config.dur,
          useNativeDriver: true, easing: Easing.inOut(Easing.sin),
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
        { top: `${config.top}%` as any, left: `${config.left}%` as any, fontSize: config.size, opacity },
      ]}
    >
      {config.char}
    </Animated.Text>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SwitchDayCelebration({ switchDate, checklistItems = [], onDismiss }: Props) {
  const [dismissing, setDismissing] = useState(false)
  const stars     = useMemo(makeStars, [])

  const dateLabel = useMemo(() =>
    new Date(switchDate + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }),
  [switchDate])

  // ── Outer — scale + opacity (native thread) ──────────────────────────────
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const cardOpacity     = useRef(new Animated.Value(0)).current
  const cardScale       = useRef(new Animated.Value(0.82)).current

  // ── Inner — background colour (JS thread) ────────────────────────────────
  // 0 = navy, 0.25 = deep-blue, 0.5 = teal, 0.75 = teal-green, 1 = forest-green
  const colorPct = useRef(new Animated.Value(0)).current

  const cardBg = colorPct.interpolate({
    inputRange:  [0, 0.25, 0.5, 0.75, 1],
    outputRange: [C_NAVY, C_DBLUE, C_TEAL, C_TGREEN, C_FGREEN],
  })

  // Pulse active flag — lets cleanup stop recursion without needing a ref to the animation
  const pulseActive = useRef(false)
  // Haptic timeout refs for cleanup
  const hapticTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // ── Entry ────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Escalating haptic buzz over ~1.5 s — Light build → Medium → Heavy peak
    const schedule: [number, () => Promise<void>][] = [
      [0,    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)],
      [120,  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)],
      [240,  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)],
      [380,  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)],
      [520,  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)],
      [660,  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)],
      [800,  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)],
      [950,  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)],
      [1100, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)],
      [1250, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)],
      [1400, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)],
    ]
    hapticTimers.current = schedule.map(([ms, fn]) =>
      setTimeout(() => fn().catch(() => {}), ms),
    )

    // Native-thread entrance
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(cardOpacity,     { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 8 }),
    ]).start()

    // Colour wash: navy → forest-green over 3.5 s, then smooth reverse-pulse forever
    pulseActive.current = true

    function startPulse() {
      if (!pulseActive.current) return
      Animated.sequence([
        Animated.timing(colorPct, { toValue: 0, duration: 2500, useNativeDriver: false, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(colorPct, { toValue: 1, duration: 2500, useNativeDriver: false, easing: Easing.inOut(Easing.sin) }),
      ]).start(({ finished }) => {
        if (finished) startPulse()
      })
    }

    Animated.timing(colorPct, {
      toValue: 1, duration: 3500,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) startPulse()
    })

    return () => {
      pulseActive.current = false
      hapticTimers.current.forEach(clearTimeout)
    }
  }, [])

  // ── Dismiss ──────────────────────────────────────────────────────────────

  function handleAnimationComplete() {
    SecureStore.setItemAsync(seenKey(switchDate), '1').catch(() => {})
    onDismiss()
  }

  function handleDismiss() {
    if (dismissing) return
    setDismissing(true)

    pulseActive.current = false
    hapticTimers.current.forEach(clearTimeout)

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})

    Animated.timing(backdropOpacity, {
      toValue: 0, duration: 600, delay: 200, useNativeDriver: true,
    }).start()

    // Scale explosion on outer view
    Animated.sequence([
      Animated.timing(cardScale, {
        toValue: 1.06, duration: 220,
        easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 22, duration: 820,
        easing: Easing.in(Easing.quad), useNativeDriver: true,
      }),
    ]).start()

    Animated.timing(cardOpacity, {
      toValue: 0, duration: 680, delay: 120,
      easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) handleAnimationComplete()
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

        {/* Outer: scale + opacity — native thread */}
        <Animated.View
          style={[
            styles.cardOuter,
            { opacity: cardOpacity, transform: [{ scale: cardScale }] },
          ]}
        >
          {/* Inner: background colour — JS thread */}
          <Animated.View style={[styles.cardInner, { backgroundColor: cardBg }]}>

            {/* Stars */}
            {!dismissing && stars.map((star, i) => (
              <Star key={i} config={star} />
            ))}

            {/* Content */}
            <View style={styles.content}>

              <Text style={styles.heading}>Switch Day</Text>

              <Text style={styles.dateLabel}>{dateLabel}</Text>

              <View style={styles.divider} />

              <Text style={[styles.tagline, checklistItems.length > 0 && { marginBottom: 24 }]}>
                Today is the handoff.
              </Text>

              {/* Packing list */}
              {checklistItems.length > 0 && (
                <View style={styles.checklist}>
                  <Text style={styles.checklistHeader}>HERE'S WHAT'S PACKED</Text>
                  {checklistItems.map((item, i) => (
                    <View key={i} style={styles.checklistRow}>
                      <Text style={styles.checklistStar}>✦</Text>
                      <Text style={styles.checklistItem}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

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

  // Outer wrapper — carries scale + opacity (native driver)
  // No background or overflow here so those don't interfere with native animations
  cardOuter: {
    width: '100%',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.32,
    shadowRadius: 40,
    elevation: 20,
  },

  // Inner wrapper — carries background colour (JS driver) + clips stars
  cardInner: {
    width: '100%',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 44,
    overflow: 'hidden',
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
    textShadowColor: 'rgba(0, 0, 0, 0.20)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: font.medium,
    color: 'rgba(255, 255, 255, 0.80)',
    textAlign: 'center',
    marginBottom: 22,
  },

  divider: {
    width: 40,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.30)',
    marginBottom: 22,
  },

  tagline: {
    fontSize: 15,
    fontFamily: font.regular,
    color: 'rgba(255, 255, 255, 0.80)',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 36,
  },

  checklist: {
    width: '100%',
    marginBottom: 28,
  },

  checklistHeader: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: font.bold,
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 10,
  },

  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    marginBottom: 7,
  },

  checklistStar: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
  },

  checklistItem: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: font.medium,
    color: '#ffffff',
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
    color: 'rgba(43, 58, 92, 0.90)',   // navy text on white button
    letterSpacing: 0.2,
  },
})
