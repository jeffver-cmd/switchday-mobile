// This screen is never directly rendered.
// The More tab uses a custom tabBarButton that opens a bottom sheet
// instead of navigating here. If somehow reached, redirect home.
import { Redirect } from 'expo-router'
export default function MorePlaceholder() {
  return <Redirect href="/(tabs)/dashboard" />
}
