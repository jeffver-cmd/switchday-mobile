import { View, Text, StyleSheet } from 'react-native'
import { font } from '@/lib/theme'

export type ToneLabel = 'cooperative' | 'neutral' | 'hostile' | 'unscored'

export function getToneLabel(score: number | null): ToneLabel {
  if (score === null) return 'unscored'
  if (score >= 70)   return 'cooperative'
  if (score >= 40)   return 'neutral'
  return 'hostile'
}

const CONFIG: Record<ToneLabel, { label: string; bg: string; text: string }> = {
  cooperative: { label: 'Cooperative', bg: '#D1FAE5', text: '#065F46' },
  neutral:     { label: 'Neutral',     bg: '#F3F4F6', text: '#374151' },
  hostile:     { label: 'Hostile',     bg: '#FEE2E2', text: '#991B1B' },
  unscored:    { label: 'Unscored',    bg: 'transparent', text: 'rgba(26,26,24,0.45)' },
}

interface Props {
  score: number | null
}

export default function ToneBadge({ score }: Props) {
  const label = getToneLabel(score)
  const cfg   = CONFIG[label]
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: label === 'unscored' ? 'rgba(26,26,24,0.20)' : 'transparent', borderWidth: label === 'unscored' ? 1 : 0 }]}>
      <Text style={[styles.text, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  text:  { fontSize: 10, fontFamily: font.semibold },
})
