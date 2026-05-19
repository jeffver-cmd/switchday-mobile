import { View, Text, StyleSheet } from 'react-native'
import { font } from '@/lib/theme'

const NAVY  = '#0F1B35'
const AMBER = '#F59E0B'
const WHITE = '#FFFFFF'

interface Props {
  hash: string | null
  tsaToken: string | null
}

export default function HashBadge({ hash, tsaToken }: Props) {
  if (!hash) return null
  const short = hash.slice(0, 16) + '…'
  return (
    <View style={styles.row}>
      <Text style={styles.hashText}>SHA-256: {short}</Text>
      {tsaToken && (
        <View style={styles.tsaBadge}>
          <Text style={styles.tsaText}>✓ RFC 3161</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  hashText: { fontSize: 10, fontFamily: font.regular, color: 'rgba(15,27,53,0.45)', fontVariant: ['tabular-nums'] },
  tsaBadge: { backgroundColor: '#D1FAE5', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  tsaText:  { fontSize: 10, fontFamily: font.semibold, color: '#065F46' },
})
