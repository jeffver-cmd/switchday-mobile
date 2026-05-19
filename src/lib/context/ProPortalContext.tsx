import { createContext, useContext, useState, ReactNode } from 'react'

// ─── types ────────────────────────────────────────────────────────────────────

export interface ProParent {
  id: string
  display_name: string
  initials: string
  color: string
}

export interface ProChild {
  id: string
  first_name: string
  last_name: string | null
  date_of_birth: string | null
  school_name: string | null
  grade: string | null
  pediatrician_name: string | null
  allergies: string[] | null
  medications: string[] | null
  connection_id: string
}

export interface ProThread {
  id: string
  topic: string | null
  type: string | null
}

export interface ProMessage {
  id: string
  thread_id: string
  sender_id: string
  body: string
  sent_at: string
  sha256_hash: string | null
  tsa_token: string | null
  tone_score: number | null
  tone_flags: string[] | null
  coaching_offered: boolean | null
  coaching_accepted: boolean | null
}

export interface ProExpense {
  id: string
  description: string
  amount: number
  category: string | null
  status: string
  split_percent: number | null
  submitted_at: string
  sha256_hash: string | null
  tsa_token: string | null
  submitted_by_id: string
}

export interface ProScheduleRow {
  id: string
  date: string
  owner_id: string
  is_switch: boolean
}

export interface ProPortalData {
  tokenId: string
  professionalName: string
  professionalEmail: string | null
  role: string
  expiresAt: string | null
  createdAt: string
  parentAId: string
  parentBId: string
  parentA: ProParent
  parentB: ProParent
  children: ProChild[]
  threads: ProThread[]
  messages: ProMessage[]
  expenses: ProExpense[]
  schedule: ProScheduleRow[]
}

// ─── context ─────────────────────────────────────────────────────────────────

interface ProPortalContextValue {
  data: ProPortalData | null
  setData: (data: ProPortalData) => void
}

const ProPortalContext = createContext<ProPortalContextValue>({
  data: null,
  setData: () => {},
})

// ─── provider ─────────────────────────────────────────────────────────────────

export function ProPortalProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ProPortalData | null>(null)
  return (
    <ProPortalContext.Provider value={{ data, setData }}>
      {children}
    </ProPortalContext.Provider>
  )
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useProPortal() {
  return useContext(ProPortalContext)
}
