/**
 * CoachModal — native equivalent of the web CoachModal.
 *
 * Shown when tone analysis returns needs_intercept = true.
 * Offers three paths: use the AI rewrite, edit the rewrite, or send the
 * original message anyway.
 */

import React, { useCallback } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native'
import { colors, radius, font, shadow } from '@/lib/theme'
import type { ToneAnalysisResult } from '@/lib/hooks/useMessages'

// ─── config ───────────────────────────────────────────────────────────────────

const TONE_CONFIG = {
  calm:    { label: 'Calm',    bg: colors.successSoft, color: colors.success  },
  neutral: { label: 'Neutral', bg: colors.surface2,    color: colors.textMuted },
  tense:   { label: 'Tense',   bg: colors.warningSoft, color: colors.warning  },
  hostile: { label: 'Hostile', bg: colors.dangerSoft,  color: colors.danger   },
}

const FLAG_LABELS: Record<string, string> = {
  legal_threat:       'Legal threat',
  child_alienation:   'Child alienation',
  blame_language:     'Blame language',
  profanity:          'Profanity',
  financial_coercion: 'Financial coercion',
  denial_of_access:   'Denial of access',
}

const LEGAL_FLAGS = new Set(['legal_threat', 'child_alienation', 'financial_coercion', 'denial_of_access'])

// ─── props ────────────────────────────────────────────────────────────────────

export interface CoachModalProps {
  visible: boolean
  result: ToneAnalysisResult
  /** Use the AI-suggested rewrite — sends it immediately */
  onUseRewrite: (rewrite: string) => void
  /** Put the rewrite back in the draft for editing */
  onEditRewrite: (rewrite: string) => void
  /** Send the original message as-is */
  onSendAnyway: () => void
  /** Dismiss without sending (restore original to draft) */
  onDismiss: () => void
}

// ─── component ────────────────────────────────────────────────────────────────

export function CoachModal({
  visible,
  result,
  onUseRewrite,
  onEditRewrite,
  onSendAnyway,
  onDismiss,
}: CoachModalProps) {
  const toneConf = TONE_CONFIG[result.tone] ?? TONE_CONFIG.neutral
  const hasLegalFlags = result.flags.some(f => LEGAL_FLAGS.has(f))
  const scoreBarWidth = `${Math.max(4, result.score)}%` as `${number}%`

  const scoreBarColor =
    result.score >= 75 ? colors.success :
    result.score >= 50 ? colors.warning :
    colors.danger

  const handleUseRewrite = useCallback(() => {
    if (result.rewrite) onUseRewrite(result.rewrite)
  }, [result.rewrite, onUseRewrite])

  const handleEditRewrite = useCallback(() => {
    if (result.rewrite) onEditRewrite(result.rewrite)
  }, [result.rewrite, onEditRewrite])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>✦ Before you send…</Text>
            <TouchableOpacity onPress={onDismiss} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSub}>Switchday Coach reviewed your message</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Tone + score */}
            <View style={styles.toneRow}>
              <View style={[styles.tonePill, { backgroundColor: toneConf.bg }]}>
                <Text style={[styles.tonePillText, { color: toneConf.color }]}>
                  {toneConf.label}
                </Text>
              </View>
              <View style={styles.scoreBarTrack}>
                <View
                  style={[
                    styles.scoreBarFill,
                    { width: scoreBarWidth, backgroundColor: scoreBarColor },
                  ]}
                />
              </View>
              <Text style={styles.scoreText}>{result.score}/100</Text>
            </View>

            {/* Legal flag warning */}
            {hasLegalFlags && (
              <View style={styles.legalBanner}>
                <Text style={styles.legalBannerText}>
                  ⚠ This message may reference legal action or parenting access. Content like this can be used as evidence in court proceedings.
                </Text>
              </View>
            )}

            {/* Flag pills */}
            {result.flags.length > 0 && (
              <View style={styles.flagRow}>
                {result.flags.map(f => (
                  <View
                    key={f}
                    style={[
                      styles.flagPill,
                      LEGAL_FLAGS.has(f)
                        ? { backgroundColor: colors.dangerSoft }
                        : { backgroundColor: colors.warningSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.flagPillText,
                        { color: LEGAL_FLAGS.has(f) ? colors.danger : colors.warning },
                      ]}
                    >
                      {FLAG_LABELS[f] ?? f}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Coaching note */}
            {!!result.coaching_note && (
              <Text style={styles.coachingNote}>"{result.coaching_note}"</Text>
            )}

            {/* Rewrite suggestion */}
            {!!result.rewrite && (
              <View style={styles.rewriteBox}>
                <Text style={styles.rewriteLabel}>Suggested rewrite</Text>
                <Text style={styles.rewriteText}>{result.rewrite}</Text>
                <View style={styles.rewriteActions}>
                  <TouchableOpacity
                    style={styles.rewriteBtn}
                    onPress={handleUseRewrite}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.rewriteBtnText}>Use this</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rewriteBtn, styles.rewriteBtnOutline]}
                    onPress={handleEditRewrite}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.rewriteBtnOutlineText}>Edit first</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Legal disclaimer */}
            <Text style={styles.disclaimer}>
              Switchday Coach is a communication tool, not legal advice. Always consult an attorney for legal questions.
            </Text>
          </ScrollView>

          {/* Send anyway */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.sendAnywayBtn, hasLegalFlags && styles.sendAnywayBtnDanger]}
              onPress={onSendAnyway}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.sendAnywayText,
                  hasLegalFlags && styles.sendAnywayTextDanger,
                ]}
              >
                Send anyway
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    maxHeight: '88%',
    ...shadow.md,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: font.bold,
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: font.regular,
    color: colors.textMuted,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: colors.textMuted,
    fontFamily: font.regular,
  },

  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },

  // Tone row
  toneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tonePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  tonePillText: {
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: 0.2,
  },
  scoreBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surface2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  scoreText: {
    fontSize: 11,
    fontFamily: font.medium,
    color: colors.textMuted,
    minWidth: 40,
    textAlign: 'right',
  },

  // Legal banner
  legalBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
  },
  legalBannerText: {
    fontSize: 12,
    fontFamily: font.regular,
    color: colors.danger,
    lineHeight: 17,
  },

  // Flags
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  flagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  flagPillText: {
    fontSize: 11,
    fontFamily: font.bold,
  },

  // Coaching note
  coachingNote: {
    fontSize: 13,
    fontFamily: font.regular,
    fontStyle: 'italic',
    color: colors.textSecondary,
    lineHeight: 19,
  },

  // Rewrite
  rewriteBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 14,
    gap: 8,
  },
  rewriteLabel: {
    fontSize: 11,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rewriteText: {
    fontSize: 14,
    fontFamily: font.regular,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  rewriteActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  rewriteBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 9,
    alignItems: 'center',
  },
  rewriteBtnText: {
    fontSize: 13,
    fontFamily: font.semibold,
    color: colors.white,
  },
  rewriteBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rewriteBtnOutlineText: {
    fontSize: 13,
    fontFamily: font.semibold,
    color: colors.textMuted,
  },

  // Disclaimer
  disclaimer: {
    fontSize: 11,
    fontFamily: font.regular,
    color: colors.textSubtle,
    lineHeight: 15,
    marginBottom: 4,
  },

  // Footer
  footer: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderHair,
  },
  sendAnywayBtn: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sendAnywayBtnDanger: {
    borderColor: colors.danger,
  },
  sendAnywayText: {
    fontSize: 13,
    fontFamily: font.semibold,
    color: colors.textMuted,
  },
  sendAnywayTextDanger: {
    color: colors.danger,
  },
})
