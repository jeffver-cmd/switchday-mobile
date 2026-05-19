import {
  View,
  Text,
  StyleSheet,
  Share,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useProPortal } from '@/lib/context/ProPortalContext'
import { font } from '@/lib/theme'
import CommunicationsTab from '@/components/pro/CommunicationsTab'
import FinancialTab       from '@/components/pro/FinancialTab'
import ScheduleTab        from '@/components/pro/ScheduleTab'
import PatternsTab        from '@/components/pro/PatternsTab'
import ChildrenTab        from '@/components/pro/ChildrenTab'

const NAVY    = '#0F1B35'
const NAVY_LT = '#0A1525'
const AMBER   = '#F59E0B'
const WHITE   = '#FFFFFF'

// ─── tab config ───────────────────────────────────────────────────────────────

type TabKey = 'communications' | 'financial' | 'schedule' | 'patterns' | 'children'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'communications', label: 'Communications' },
  { key: 'financial',      label: 'Financial'       },
  { key: 'schedule',       label: 'Custody Schedule'},
  { key: 'patterns',       label: 'Behavioral Analysis' },
  { key: 'children',       label: 'Children'        },
]

// ─── main ─────────────────────────────────────────────────────────────────────

export default function PortalScreen() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const { data }  = useProPortal()
  const [activeTab, setActiveTab] = useState<TabKey>('communications')

  if (!data) return null

  async function handleShare() {
    try {
      await Share.share({
        message: `Certified Records Portal — ${data!.parentA.display_name} & ${data!.parentB.display_name}`,
        url:     `https://switchday.app/pro/${token}`,
      })
    } catch {
      // dismissed
    }
  }

  function formatExpiry(expiresAt: string | null) {
    if (!expiresAt) return 'No expiry'
    return new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatRole(role: string) {
    switch (role) {
      case 'attorney': return 'Attorney'
      case 'mediator': return 'Mediator'
      case 'gal':      return 'GAL'
      default:         return role
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: NAVY }} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandLabel}>Switchday</Text>
          <Text style={styles.portalLabel}>Certified Records Portal</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.proName} numberOfLines={1}>{data.professionalName}</Text>
          <Text style={styles.proMeta}>{formatRole(data.role)} · Exp. {formatExpiry(data.expiresAt)}</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.70}>
          <Ionicons name="share-outline" size={20} color={AMBER} />
        </TouchableOpacity>
      </View>

      {/* Watermark bar */}
      <View style={styles.watermarkBar}>
        <Text style={styles.watermarkText}>
          Confidential · Read-only Certified Record · {data.parentA.display_name} & {data.parentB.display_name}
        </Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map(tab => {
            const active = tab.key === activeTab
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabBtn}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                {active && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* Tab content */}
      <View style={styles.content}>
        {activeTab === 'communications' && <CommunicationsTab />}
        {activeTab === 'financial'      && <FinancialTab />}
        {activeTab === 'schedule'       && <ScheduleTab />}
        {activeTab === 'patterns'       && <PatternsTab />}
        {activeTab === 'children'       && <ChildrenTab />}
      </View>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: NAVY }} />
    </View>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: NAVY },

  // Header
  header:         {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: NAVY,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 10,
  },
  headerLeft:     { flex: 1 },
  brandLabel:     { fontSize: 13, fontFamily: font.extrabold, color: WHITE, letterSpacing: 0.3 },
  portalLabel:    { fontSize: 10, fontFamily: font.regular,  color: 'rgba(255,255,255,0.40)', marginTop: 1, letterSpacing: 0.3 },
  headerRight:    { flex: 2, alignItems: 'flex-end' },
  proName:        { fontSize: 12, fontFamily: font.semibold, color: WHITE, textAlign: 'right' },
  proMeta:        { fontSize: 10, fontFamily: font.regular,  color: 'rgba(255,255,255,0.40)', marginTop: 1 },
  shareBtn:       { padding: 6 },

  // Watermark bar
  watermarkBar:   {
    backgroundColor: '#0A1525',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  watermarkText:  { fontSize: 10, fontFamily: font.medium, color: AMBER, letterSpacing: 0.3, textAlign: 'center' },

  // Tab bar
  tabBarWrap:     { backgroundColor: NAVY, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  tabBarContent:  { paddingHorizontal: 12, paddingVertical: 0 },
  tabBtn:         { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0, position: 'relative', alignItems: 'center' },
  tabLabel:       { fontSize: 12, fontFamily: font.medium, color: 'rgba(255,255,255,0.45)', paddingBottom: 10 },
  tabLabelActive: { color: AMBER, fontFamily: font.semibold },
  tabUnderline:   { position: 'absolute', bottom: 0, left: 12, right: 12, height: 2, backgroundColor: AMBER, borderRadius: 1 },

  // Content
  content:        { flex: 1, backgroundColor: NAVY },
})
