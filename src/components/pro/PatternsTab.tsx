import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import Svg, { Rect, Text as SvgText } from 'react-native-svg'
import { font, radius } from '@/lib/theme'
import { useProPortal, ProMessage } from '@/lib/context/ProPortalContext'
import { getToneLabel } from './ToneBadge'

const NAVY  = '#0F1B35'
const NAVY2 = '#1A2B47'
const AMBER = '#F59E0B'
const WHITE = '#FFFFFF'
const RED   = '#EF4444'

// ─── helpers ─────────────────────────────────────────────────────────────────

function startOfWeek(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().split('T')[0]
}

function buildWeeklyHostileData(messages: ProMessage[], parentAId: string, parentBId: string) {
  // last 30 days
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const recent = messages.filter(m => new Date(m.sent_at) >= since)

  const weeks = new Map<string, { a: number; b: number }>()
  for (const msg of recent) {
    if (getToneLabel(msg.tone_score) !== 'hostile') continue
    const week = startOfWeek(msg.sent_at.split('T')[0])
    const cur = weeks.get(week) ?? { a: 0, b: 0 }
    if (msg.sender_id === parentAId) cur.a++
    else cur.b++
    weeks.set(week, cur)
  }

  // Sort weeks ascending and fill gaps
  const sorted = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return sorted
}

function buildFlagFrequency(messages: ProMessage[]) {
  const counts = new Map<string, number>()
  for (const msg of messages) {
    for (const flag of msg.tone_flags ?? []) {
      counts.set(flag, (counts.get(flag) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

const FLAG_LABELS: Record<string, string> = {
  legal_threat:      'Legal threat',
  child_alienation:  'Child alienation',
  profanity:         'Profanity',
  financial_dispute: 'Financial dispute',
  custody_violation: 'Custody violation',
}

// ─── bar chart ────────────────────────────────────────────────────────────────

interface BarChartProps {
  data: [string, { a: number; b: number }][]
  colorA: string
  colorB: string
  nameA: string
  nameB: string
}

function BarChart({ data, colorA, colorB, nameA, nameB }: BarChartProps) {
  const WIDTH  = 320
  const HEIGHT = 120
  const PAD    = 28
  const BOTTOM = 20

  if (data.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>No hostile messages in this period.</Text>
      </View>
    )
  }

  const maxVal = Math.max(...data.flatMap(([, v]) => [v.a, v.b]), 1)
  const barAreaH = HEIGHT - BOTTOM
  const totalBars = data.length * 2
  const barW = Math.min(18, (WIDTH - PAD * 2) / (totalBars + data.length))
  const groupW = barW * 2 + 4
  const totalW = data.length * groupW + (data.length - 1) * 8

  return (
    <View>
      <Svg width={WIDTH} height={HEIGHT} style={{ alignSelf: 'center' }}>
        {data.map(([week, v], i) => {
          const x = PAD + i * (groupW + 8)
          const hA = (v.a / maxVal) * barAreaH
          const hB = (v.b / maxVal) * barAreaH
          const wkLabel = new Date(week + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
          return (
            <React.Fragment key={week}>
              <Rect x={x} y={barAreaH - hA} width={barW} height={hA} fill={colorA} rx={2} />
              <Rect x={x + barW + 4} y={barAreaH - hB} width={barW} height={hB} fill={colorB} rx={2} />
              <SvgText x={x + barW} y={HEIGHT - 4} fontSize={9} fill="rgba(255,255,255,0.40)" textAnchor="middle" fontFamily={font.regular}>
                {wkLabel}
              </SvgText>
            </React.Fragment>
          )
        })}
      </Svg>
      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colorA }]} />
          <Text style={styles.legendText}>{nameA}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colorB }]} />
          <Text style={styles.legendText}>{nameB}</Text>
        </View>
      </View>
    </View>
  )
}

// ─── stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

// ─── main tab ─────────────────────────────────────────────────────────────────

export default function PatternsTab() {
  const { data } = useProPortal()
  if (!data) return null

  const { messages, parentAId, parentBId, parentA, parentB } = data

  // Stats
  const since30 = new Date(); since30.setDate(since30.getDate() - 30)
  const recent  = messages.filter(m => new Date(m.sent_at) >= since30)
  const scored  = messages.filter(m => m.tone_score !== null)
  const hostile = messages.filter(m => getToneLabel(m.tone_score) === 'hostile')
  const hostileA = hostile.filter(m => m.sender_id === parentAId).length
  const hostileB = hostile.filter(m => m.sender_id === parentBId).length
  const flagTotal = messages.reduce((n, m) => n + (m.tone_flags?.length ?? 0), 0)
  const legalFlags = messages.filter(m => m.tone_flags?.includes('legal_threat')).length

  const offered  = messages.filter(m => m.coaching_offered).length
  const accepted = messages.filter(m => m.coaching_accepted).length
  const coachingPct = offered > 0 ? Math.round((accepted / offered) * 100) : null

  // Escalation: any week in last 30 days with ≥3 hostile messages
  const weeklyData = buildWeeklyHostileData(messages, parentAId, parentBId)
  const escalated  = weeklyData.some(([, v]) => (v.a + v.b) >= 3)

  const flagFreq = buildFlagFrequency(messages)

  return (
    <ScrollView contentContainerStyle={styles.scroll}>

      {/* Escalation warning */}
      {escalated && (
        <View style={styles.escalationBanner}>
          <Text style={styles.escalationText}>
            Elevated hostility detected in the last 30 days.
          </Text>
        </View>
      )}

      {/* Stat grid */}
      <Text style={styles.sectionLabel}>30-DAY OVERVIEW</Text>
      <View style={styles.statGrid}>
        <StatCard label={`Hostile — ${parentA.display_name}`} value={hostileA} accent={hostileA > 5} />
        <StatCard label={`Hostile — ${parentB.display_name}`} value={hostileB} accent={hostileB > 5} />
        <StatCard label="Legal flags"             value={legalFlags} accent={legalFlags > 0} />
        <StatCard label="Messages analyzed"       value={scored.length} />
      </View>
      {coachingPct !== null && (
        <View style={styles.coachingRow}>
          <Text style={styles.coachingLabel}>Coaching acceptance rate:</Text>
          <Text style={styles.coachingValue}>{coachingPct}%</Text>
        </View>
      )}

      {/* Bar chart */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>HOSTILE MESSAGES / WEEK (LAST 30 DAYS)</Text>
      <View style={styles.chartCard}>
        <BarChart
          data={weeklyData}
          colorA={parentA.color}
          colorB={parentB.color}
          nameA={parentA.display_name}
          nameB={parentB.display_name}
        />
      </View>

      {/* Flag frequency */}
      {flagFreq.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>FLAG FREQUENCY</Text>
          <View style={styles.flagList}>
            {flagFreq.map(([flag, count]) => (
              <View key={flag} style={styles.flagRow}>
                <Text style={styles.flagName}>{FLAG_LABELS[flag] ?? flag}</Text>
                <Text style={styles.flagCount}>{count}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:            { padding: 16, paddingBottom: 40 },

  escalationBanner:  { backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: radius.md, padding: 12, marginBottom: 16 },
  escalationText:    { fontSize: 13, fontFamily: font.semibold, color: AMBER, textAlign: 'center' },

  sectionLabel:      { fontSize: 10, fontFamily: font.semibold, color: 'rgba(255,255,255,0.40)', letterSpacing: 1, marginBottom: 10 },

  statGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard:          { backgroundColor: NAVY2, borderRadius: radius.md, padding: 14, flex: 1, minWidth: 130 },
  statCardAccent:    { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)' },
  statValue:         { fontSize: 26, fontFamily: font.bold, color: WHITE, marginBottom: 2 },
  statLabel:         { fontSize: 11, fontFamily: font.regular, color: 'rgba(255,255,255,0.55)', lineHeight: 15 },

  coachingRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  coachingLabel:     { fontSize: 12, fontFamily: font.regular, color: 'rgba(255,255,255,0.55)' },
  coachingValue:     { fontSize: 14, fontFamily: font.bold, color: WHITE },

  chartCard:         { backgroundColor: NAVY2, borderRadius: radius.md, padding: 16 },
  chartEmpty:        { alignItems: 'center', padding: 24 },
  chartEmptyText:    { fontSize: 13, fontFamily: font.regular, color: 'rgba(255,255,255,0.40)' },
  legend:            { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 10 },
  legendItem:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:         { width: 8, height: 8, borderRadius: 4 },
  legendText:        { fontSize: 11, fontFamily: font.regular, color: 'rgba(255,255,255,0.55)' },

  flagList:          { backgroundColor: NAVY2, borderRadius: radius.md, overflow: 'hidden' },
  flagRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  flagName:          { fontSize: 13, fontFamily: font.medium, color: 'rgba(255,255,255,0.80)' },
  flagCount:         { fontSize: 14, fontFamily: font.bold, color: AMBER },
})
