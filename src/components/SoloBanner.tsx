import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

type Props = {
  pendingEmail?: string | null;
};

export default function SoloBanner({ pendingEmail }: Props) {
  const router = useRouter();

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {pendingEmail
          ? `Waiting for ${pendingEmail} to accept your invite.`
          : 'Documenting solo. '}
      </Text>
      {!pendingEmail && (
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Text style={styles.link}>Invite co-parent →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F5F5F0',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0DDD8',
    gap: 4,
  },
  text: {
    fontSize: 13,
    color: '#6B6B6B',
    lineHeight: 18,
  },
  link: {
    fontSize: 13,
    color: '#2B3A5C',
    fontWeight: '600',
    lineHeight: 18,
  },
});
