// This screen is hidden from the tab bar via href: null in the portal layout.
// It serves as a fallback route entry point — navigation always goes to
// /(portal)/home directly. This file must remain present for Expo Router.
import { Redirect } from 'expo-router'

export default function PortalEntryScreen() {
  return <Redirect href="/(portal)/home" />
}
