// Switchday database types
// Manually maintained to match supabase/schema.sql
// Run `npx supabase gen types typescript --project-id eevxuxgiphyazyvijrhj` to regenerate

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type CustodyOwner = 'user_a' | 'user_b'
export type ScheduleStatus = 'draft' | 'proposed' | 'accepted' | 'declined' | 'superseded'
export type SchedulePattern = 'week_on_week_off' | '2_2_3' | '3_4_4_3' | '2_2_5_5' | 'custom'
export type SwitchStatus = 'pending' | 'counter_proposed' | 'approved' | 'declined' | 'cancelled'
export type ObserverStatus = 'pending' | 'active' | 'revoked'
export type ProfessionalRole = 'attorney' | 'mediator' | 'gal' | 'other'
export type ProAccessStatus = 'active' | 'revoked' | 'expired' | 'pending_consent'
export type MessageVia = 'app' | 'sms'
export type ExpenseStatus = 'requested' | 'pending' | 'approved' | 'paid' | 'disputed' | 'declined'
export type ExpenseCategory = 'medical' | 'education' | 'activities' | 'clothing' | 'other'
export type ExpenseFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type ConnectionStatus = 'pending' | 'active' | 'dissolved'
export type ImportPlatform = 'ofw' | 'talkingparents' | 'parenting_plan'
export type ThreadType = 'co_parent' | 'family' | 'child_parent'
export type ImportSection = 'messages' | 'calendar' | 'journal' | 'expenses' | 'calls' | 'info_bank' | 'custody_plan'
export type VaultCategory = 'court_order' | 'agreement' | 'medical' | 'school' | 'financial' | 'other'
export type JournalMood = 'calm' | 'frustrated' | 'worried' | 'hopeful' | 'angry'
export type ImportStatus = 'processing' | 'complete' | 'failed'
/** Current valid plans. 'standard' and 'premium' are legacy values that may
 *  exist in the DB for older subscribers — treat them as 'pro' at runtime. */
export type UserPlan = 'free' | 'pro' | 'standard' | 'premium'
export type AccountStatus = 'active' | 'closed'

/** JSON blob stored in parenting_schedules.pattern_data */
export interface PatternData {
  first_week_owner_id: string
  owner_sequence?: string[]
  cycle_length?: number
  specific_days?: Record<string, string>
}

/** Convenience alias — parenting_schedules row with a typed pattern_data */
export type Schedule = Omit<Database['public']['Tables']['parenting_schedules']['Row'], 'pattern_data'> & {
  pattern_data: PatternData
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          initials: string
          color: string
          phone: string | null
          phone_verified: boolean
          sms_relay_enabled: boolean
          sms_opted_out: boolean
          sms_consent_at: string | null
          proxy_number: string | null
          plan: UserPlan
          pro_trial_until: string | null
          account_status: AccountStatus
          role: 'parent' | 'child'
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          ical_token: string | null
          theme: string | null
          avatar_emoji: string | null
          avatar_url: string | null
          background_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name: string
          initials: string
          color?: string
          phone?: string | null
          phone_verified?: boolean
          sms_relay_enabled?: boolean
          sms_opted_out?: boolean
          sms_consent_at?: string | null
          proxy_number?: string | null
          plan?: UserPlan
          account_status?: AccountStatus
          role?: 'parent' | 'child'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          ical_token?: string | null
          theme?: string | null
          avatar_emoji?: string | null
          avatar_url?: string | null
          background_url?: string | null
        }
        Update: {
          display_name?: string
          initials?: string
          color?: string
          phone?: string | null
          phone_verified?: boolean
          sms_relay_enabled?: boolean
          sms_opted_out?: boolean
          sms_consent_at?: string | null
          proxy_number?: string | null
          plan?: UserPlan
          account_status?: AccountStatus
          role?: 'parent' | 'child'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          ical_token?: string | null
          theme?: string | null
          avatar_emoji?: string | null
          avatar_url?: string | null
          background_url?: string | null
        }
        Relationships: []
      }
      co_parent_connections: {
        Row: {
          id: string
          user_a_id: string
          user_b_id: string | null
          status: ConnectionStatus
          invited_at: string
          accepted_at: string | null
          dissolved_at: string | null
          invited_email: string | null
          invite_token: string | null
          switch_time: string | null
          switch_timezone: string | null
          pending_switch_time: string | null
          pending_switch_time_proposed_by: string | null
          pending_switch_time_proposed_at: string | null
          switch_location_mode: 'neutral' | 'per_parent' | null
          switch_location_neutral_id: string | null
          switch_location_a_id: string | null
          switch_location_b_id: string | null
          pending_switch_location: { mode: 'neutral' | 'per_parent'; neutral_id?: string; a_id?: string; b_id?: string } | null
          pending_switch_location_proposed_by: string | null
          pending_switch_location_proposed_at: string | null
        }
        Insert: {
          id?: string
          user_a_id: string
          user_b_id?: string | null
          status?: ConnectionStatus
          accepted_at?: string | null
          dissolved_at?: string | null
          invited_email?: string | null
          invite_token?: string | null
          switch_time?: string | null
          switch_timezone?: string | null
          pending_switch_time?: string | null
          pending_switch_time_proposed_by?: string | null
          pending_switch_time_proposed_at?: string | null
          switch_location_mode?: 'neutral' | 'per_parent' | null
          switch_location_neutral_id?: string | null
          switch_location_a_id?: string | null
          switch_location_b_id?: string | null
          pending_switch_location?: { mode: 'neutral' | 'per_parent'; neutral_id?: string; a_id?: string; b_id?: string } | null
          pending_switch_location_proposed_by?: string | null
          pending_switch_location_proposed_at?: string | null
        }
        Update: {
          status?: ConnectionStatus
          user_b_id?: string | null
          accepted_at?: string | null
          dissolved_at?: string | null
          invited_email?: string | null
          invite_token?: string | null
          switch_time?: string | null
          switch_timezone?: string | null
          pending_switch_time?: string | null
          pending_switch_time_proposed_by?: string | null
          pending_switch_time_proposed_at?: string | null
          switch_location_mode?: 'neutral' | 'per_parent' | null
          switch_location_neutral_id?: string | null
          switch_location_a_id?: string | null
          switch_location_b_id?: string | null
          pending_switch_location?: { mode: 'neutral' | 'per_parent'; neutral_id?: string; a_id?: string; b_id?: string } | null
          pending_switch_location_proposed_by?: string | null
          pending_switch_location_proposed_at?: string | null
        }
        Relationships: []
      }
      saved_locations: {
        Row: {
          id: string
          connection_id: string
          nickname: string
          address: string
          created_by_id: string | null
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          nickname: string
          address: string
          created_by_id?: string | null
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          nickname?: string
          address?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      switch_time_overrides: {
        Row: {
          id: string
          connection_id: string
          date: string
          switch_time: string
          set_by_id: string
          note: string | null
          location: string | null
          location_id: string | null
          created_at: string
          status: 'pending' | 'approved' | 'declined'
          responded_by_id: string | null
          responded_at: string | null
          decline_reason: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          date: string
          switch_time: string
          set_by_id: string
          note?: string | null
          location?: string | null
          location_id?: string | null
          created_at?: string
          status?: 'pending' | 'approved' | 'declined'
          responded_by_id?: string | null
          responded_at?: string | null
          decline_reason?: string | null
        }
        Update: {
          switch_time?: string
          note?: string | null
          location?: string | null
          location_id?: string | null
          status?: 'pending' | 'approved' | 'declined'
          responded_by_id?: string | null
          responded_at?: string | null
          decline_reason?: string | null
        }
        Relationships: []
      }
       children: {
         Row: {
           id: string
           connection_id: string | null
           user_id: string | null
           auth_user_id: string | null
           child_invite_token: string | null
           child_invited_at: string | null
           child_invite_email: string | null
           name: string
           date_of_birth: string | null
           school: string | null
            school_address: string | null
            grade: string | null
             doctor: string | null
             doctor_phone: string | null
             doctor_place: string | null
             doctor_address: string | null
             dentist_name: string | null
             dentist_phone: string | null
             dentist_place: string | null
             dentist_address: string | null
            allergies: string[]
           medications: string[]
           shirt_size: string | null
           pants_size: string | null
           shoe_size: string | null
           dress_size: string | null
           height: string | null
           weight: string | null
           babysitter_name: string | null
           babysitter_phone: string | null
           emergency_contact_name: string | null
           emergency_contact_phone: string | null
           emergency_contact_relation: string | null
           notes: string | null
           parent_nicknames: Record<string, string>
           created_at: string
           updated_at: string
         }
         Insert: {
           id?: string
           connection_id?: string | null
           user_id?: string | null
           auth_user_id?: string | null
           child_invite_token?: string | null
           child_invited_at?: string | null
           child_invite_email?: string | null
            name: string
            date_of_birth?: string | null
            school?: string | null
            school_address?: string | null
            grade?: string | null
             doctor?: string | null
             doctor_phone?: string | null
             doctor_place?: string | null
             doctor_address?: string | null
             dentist_name?: string | null
             dentist_phone?: string | null
             dentist_place?: string | null
             dentist_address?: string | null
             allergies?: string[]
             medications?: string[]
              shirt_size?: string | null
              pants_size?: string | null
              shoe_size?: string | null
              dress_size?: string | null
              height?: string | null
              weight?: string | null
              babysitter_name?: string | null
              babysitter_phone?: string | null
              emergency_contact_name?: string | null
              emergency_contact_phone?: string | null
              emergency_contact_relation?: string | null
              notes?: string | null
            }
            Update: {
             connection_id?: string | null
             user_id?: string | null
             auth_user_id?: string | null
             child_invite_token?: string | null
             child_invited_at?: string | null
             child_invite_email?: string | null
             name?: string
             date_of_birth?: string | null
             school?: string | null
             school_address?: string | null
             grade?: string | null
             doctor?: string | null
             doctor_phone?: string | null
             doctor_place?: string | null
             doctor_address?: string | null
             dentist_name?: string | null
             dentist_phone?: string | null
             dentist_place?: string | null
             dentist_address?: string | null
           allergies?: string[]
           medications?: string[]
           shirt_size?: string | null
           pants_size?: string | null
           shoe_size?: string | null
           dress_size?: string | null
           height?: string | null
           weight?: string | null
           babysitter_name?: string | null
           babysitter_phone?: string | null
           emergency_contact_name?: string | null
           emergency_contact_phone?: string | null
           emergency_contact_relation?: string | null
           notes?: string | null
           parent_nicknames?: Record<string, string>
         }
         Relationships: []
       }
      message_threads: {
        Row: {
          id: string
          connection_id: string
          topic: string
          thread_type: ThreadType
          created_at: string
          last_message_at: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          topic: string
          thread_type?: ThreadType
          last_message_at?: string | null
        }
        Update: {
          last_message_at?: string | null
        }
        Relationships: []
      }
      thread_participants: {
        Row: {
          id: string
          thread_id: string
          user_id: string
          created_at: string
          passcode_hash: string | null
          passcode_required: boolean
        }
        Insert: {
          id?: string
          thread_id: string
          user_id: string
          passcode_hash?: string | null
          passcode_required?: boolean
        }
        Update: {
          passcode_hash?: string | null
          passcode_required?: boolean
        }
        Relationships: []
      }
      thread_last_viewed: {
        Row: {
          id: string
          thread_id: string
          user_id: string
          last_viewed_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          user_id: string
          last_viewed_at?: string
        }
        Update: {
          last_viewed_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          thread_id: string
          connection_id: string
          sender_id: string
          body: string
          via: MessageVia
          sent_at: string
          read_at: string | null
          sha256_hash: string
          tsa_token: string | null
          import_id: string | null
          origin_platform: ImportPlatform | null
          origin_timestamp: string | null
          tone_score: number | null
          tone_flags: string[] | null
          coaching_offered: boolean | null
          coaching_accepted: boolean | null
        }
        Insert: {
          id?: string
          thread_id: string
          connection_id: string
          sender_id: string
          body: string
          via?: MessageVia
          read_at?: string | null
          sha256_hash: string
          tsa_token?: string | null
          import_id?: string | null
          origin_platform?: ImportPlatform | null
          origin_timestamp?: string | null
          tone_score?: number | null
          tone_flags?: string[] | null
          coaching_offered?: boolean | null
          coaching_accepted?: boolean | null
        }
         Update: {
           read_at?: string | null
           tsa_token?: string | null
         }
         Relationships: []
       }
       calendar_events: {
         Row: {
           id: string
           connection_id: string
           created_by_id: string
           proposed_by_child_id: string | null
            title: string
            description: string | null
            location: string | null
            start_date: string
            end_date: string | null
            all_day: boolean
            start_time: string | null
            end_time: string | null
            category: string
            google_event_id: string | null
            created_at: string
            sha256_hash: string
           tsa_token: string | null
           import_id: string | null
           origin_platform: ImportPlatform | null
           origin_timestamp: string | null
         }
         Insert: {
           id?: string
           connection_id: string
           created_by_id: string
           proposed_by_child_id?: string | null
           title: string
            description?: string | null
            location?: string | null
            start_date: string
            end_date?: string | null
            all_day?: boolean
            start_time?: string | null
            end_time?: string | null
            category?: string
            google_event_id?: string | null
            sha256_hash: string
           tsa_token?: string | null
           import_id?: string | null
           origin_platform?: ImportPlatform | null
           origin_timestamp?: string | null
         }
          Update: {
            title?: string
            description?: string | null
            location?: string | null
            start_date?: string
            end_date?: string | null
            all_day?: boolean
            start_time?: string | null
            end_time?: string | null
            category?: string
          }
          Relationships: []
        }
       expenses: {
        Row: {
          id: string
          connection_id: string
          submitted_by_id: string | null
          submitted_by_child_id: string | null
          requested_split_note: string | null
          description: string
          amount: number
          category: ExpenseCategory
          split_percent: number
          status: ExpenseStatus
          receipt_url: string | null
          payment_link: string | null
          payment_confirmed_at: string | null
          payment_confirmed_by_id: string | null
          submitted_at: string
          sha256_hash: string
          tsa_token: string | null
          import_id: string | null
          origin_platform: ImportPlatform | null
          origin_timestamp: string | null
          recurring_expense_id: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          submitted_by_id?: string | null
          submitted_by_child_id?: string | null
          requested_split_note?: string | null
          description: string
          amount: number
          category: ExpenseCategory
          split_percent?: number
          status?: ExpenseStatus
          receipt_url?: string | null
          payment_link?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by_id?: string | null
          sha256_hash: string
          tsa_token?: string | null
          import_id?: string | null
          origin_platform?: ImportPlatform | null
          origin_timestamp?: string | null
          recurring_expense_id?: string | null
        }
        Update: {
          status?: ExpenseStatus
          submitted_by_id?: string | null
          split_percent?: number
          payment_confirmed_at?: string | null
          payment_confirmed_by_id?: string | null
          receipt_url?: string | null
          payment_link?: string | null
          tsa_token?: string | null
        }
        Relationships: []
      }
      expense_status_log: {
        Row: {
          id: string
          expense_id: string
          changed_by_id: string
          from_status: ExpenseStatus | null
          to_status: ExpenseStatus
          note: string | null
          changed_at: string
          sha256_hash: string
        }
        Insert: {
          id?: string
          expense_id: string
          changed_by_id: string
          from_status?: ExpenseStatus | null
          to_status: ExpenseStatus
          note?: string | null
          sha256_hash: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          id: string
          connection_id: string
          created_by_id: string
          description: string
          amount: number
          category: ExpenseCategory
          split_percent: number
          frequency: ExpenseFrequency
          interval_value: number
          /** Pin monthly/yearly templates to a specific day of the month (1–31). Null = use the start_date day. */
          day_of_month: number | null
          /** Pin weekly templates to a specific weekday (0 = Sunday … 6 = Saturday). Null = no anchor. */
          day_of_week: number | null
          start_date: string
          end_date: string | null
          next_due_at: string
          last_fired_at: string | null
          paused: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          connection_id: string
          created_by_id: string
          description: string
          amount: number
          category: ExpenseCategory
          split_percent?: number
          frequency: ExpenseFrequency
          interval_value?: number
          day_of_month?: number | null
          day_of_week?: number | null
          start_date: string
          end_date?: string | null
          next_due_at: string
          last_fired_at?: string | null
          paused?: boolean
        }
        Update: {
          description?: string
          amount?: number
          category?: ExpenseCategory
          split_percent?: number
          frequency?: ExpenseFrequency
          interval_value?: number
          day_of_month?: number | null
          day_of_week?: number | null
          end_date?: string | null
          next_due_at?: string
          last_fired_at?: string | null
          paused?: boolean
        }
        Relationships: []
      }
      custody_schedule: {
        Row: {
          id: string
          connection_id: string
          date: string
          owner_id: string
          is_switch: boolean
          note: string | null
          created_at: string
          sha256_hash: string
          tsa_token: string | null
          import_id: string | null
          origin_platform: ImportPlatform | null
          origin_timestamp: string | null
          confirmed: boolean
          pending_schedule_id: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          date: string
          owner_id: string
          is_switch?: boolean
          note?: string | null
          sha256_hash: string
          tsa_token?: string | null
          import_id?: string | null
          origin_platform?: ImportPlatform | null
          origin_timestamp?: string | null
          confirmed?: boolean
          pending_schedule_id?: string | null
        }
        Update: {
          confirmed?: boolean
          pending_schedule_id?: string | null
          tsa_token?: string | null
        }
        Relationships: []
      }
      attorney_annotations: {
        Row: {
          id: string
          access_token_id: string
          connection_id: string
          resource_type: string
          resource_id: string
          flag_type: string
          note: string
          text_selection: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          access_token_id: string
          connection_id: string
          resource_type: string
          resource_id: string
          flag_type: string
          note: string
          text_selection?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          access_token_id?: string
          connection_id?: string
          resource_type?: string
          resource_id?: string
          flag_type?: string
          note?: string
          text_selection?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          actor_id: string
          action: string
          resource_type: string
          resource_id: string
          metadata: Json | null
          ip_address: string | null
          user_agent: string | null
          occurred_at: string
          sha256_hash: string
        }
        Insert: {
          id?: string
          actor_id: string
          action: string
          resource_type: string
          resource_id: string
          metadata?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          sha256_hash: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      imports: {
        Row: {
          id: string
          connection_id: string
          performed_by_id: string
          platform: ImportPlatform
          section: ImportSection
          source_pdf_url: string
          source_pdf_hash: string
          status: ImportStatus
          records_imported: number | null
          date_range_start: string | null
          date_range_end: string | null
          error_message: string | null
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          performed_by_id: string
          platform: ImportPlatform
          section: ImportSection
          source_pdf_url: string
          source_pdf_hash: string
          status?: ImportStatus
          records_imported?: number | null
          date_range_start?: string | null
          date_range_end?: string | null
          error_message?: string | null
          completed_at?: string | null
        }
        Update: {
          status?: ImportStatus
          records_imported?: number | null
          date_range_start?: string | null
          date_range_end?: string | null
          error_message?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
       parenting_schedules: {
         Row: {
           id: string
           connection_id: string
           created_by_id: string
           name: string
           pattern: SchedulePattern
           start_date: string
           end_date: string
           pattern_data: Json
           status: ScheduleStatus
           proposed_at: string | null
           responded_at: string | null
           responded_by_id: string | null
           decline_reason: string | null
           note: string | null
           supersedes_id: string | null
           created_at: string
            updated_at: string
            sha256_hash: string | null
            tsa_token: string | null
          }
          Insert: {
            id?: string
            connection_id: string
            created_by_id: string
            name: string
            pattern: SchedulePattern
            start_date: string
            end_date: string
            pattern_data?: Json
            status?: ScheduleStatus
            note?: string | null
            supersedes_id?: string | null
          }
          Update: {
            name?: string
            pattern?: SchedulePattern
            start_date?: string
            end_date?: string
            pattern_data?: Json
            status?: ScheduleStatus
            proposed_at?: string | null
            responded_at?: string | null
            responded_by_id?: string | null
            decline_reason?: string | null
            note?: string | null
           supersedes_id?: string | null
         }
         Relationships: []
       }
       custody_switch_requests: {
         Row: {
           id: string
           connection_id: string
           requested_by_id: string
           switch_date: string
           current_owner_id: string
           proposed_owner_id: string
           reason: string | null
           status: SwitchStatus
           switch_type: 'one_way' | 'two_way'
           return_date: string | null
           counter_return_date: string | null
           counter_proposed_by_id: string | null
           counter_proposed_at: string | null
           responded_at: string | null
           responded_by_id: string | null
           decline_reason: string | null
           override_schedule_id: string | null
           created_at: string
           updated_at: string
           sha256_hash: string
           tsa_token: string | null
         }
         Insert: {
           id?: string
           connection_id: string
           requested_by_id: string
           switch_date: string
           current_owner_id: string
           proposed_owner_id: string
           reason?: string | null
           status?: SwitchStatus
           switch_type?: 'one_way' | 'two_way'
           return_date?: string | null
           sha256_hash: string
           tsa_token?: string | null
         }
         Update: {
           status?: SwitchStatus
           counter_return_date?: string | null
           counter_proposed_by_id?: string | null
           counter_proposed_at?: string | null
           responded_at?: string | null
           responded_by_id?: string | null
           decline_reason?: string | null
           override_schedule_id?: string | null
           tsa_token?: string | null
         }
         Relationships: []
       }
      connection_observers: {
        Row: {
          id: string
          connection_id: string
          observer_id: string
          invited_by_id: string
          relationship: string | null
          status: ObserverStatus
          invited_at: string
          accepted_at: string | null
          revoked_at: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          observer_id: string
          invited_by_id: string
          relationship?: string | null
          status?: ObserverStatus
        }
        Update: {
          relationship?: string | null
          status?: ObserverStatus
          accepted_at?: string | null
          revoked_at?: string | null
        }
        Relationships: []
      }
       professional_access_tokens: {
        Row: {
          id: string
          connection_id: string
          invited_by_id: string
          professional_name: string
          professional_email: string | null
          role: ProfessionalRole
          token: string
          status: ProAccessStatus
          expires_at: string | null
          last_accessed_at: string | null
          created_at: string
          revoked_at: string | null
          revoked_by_id: string | null
          firm_name: string | null
          bar_number: string | null
          referral_code: string | null
          mediator_consent_b: boolean
        }
        Insert: {
          id?: string
          connection_id: string
          invited_by_id: string
          professional_name: string
          professional_email?: string | null
          role?: ProfessionalRole
          token?: string
          status?: ProAccessStatus
          expires_at?: string | null
          firm_name?: string | null
          bar_number?: string | null
          referral_code?: string | null
          mediator_consent_b?: boolean
        }
        Update: {
          status?: ProAccessStatus
          expires_at?: string | null
          last_accessed_at?: string | null
          revoked_at?: string | null
          revoked_by_id?: string | null
          firm_name?: string | null
          bar_number?: string | null
          mediator_consent_b?: boolean
        }
        Relationships: []
      }
      mediator_session_notes: {
        Row: {
          id: string
          access_token_id: string
          connection_id: string
          session_date: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          access_token_id: string
          connection_id: string
          session_date: string
          content: string
        }
        Update: {
          session_date?: string
          content?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_signups: {
        Row: {
          id: string
          referral_code: string
          referred_user_id: string
          signed_up_at: string
        }
        Insert: {
          id?: string
          referral_code: string
          referred_user_id: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          id: string
          user_id: string
          access_token: string
          refresh_token: string | null
          expires_at: string
          calendar_id: string
          gcal_color_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          access_token: string
          refresh_token?: string | null
          expires_at: string
          calendar_id?: string
          gcal_color_id?: string
        }
        Update: {
          access_token?: string
          refresh_token?: string | null
          expires_at?: string
          calendar_id?: string
          gcal_color_id?: string
        }
        Relationships: []
      }
      import_annotations: {
        Row: {
          id: string
          import_id: string
          record_type: string
          record_id: string
          added_by_id: string
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          import_id: string
          record_type: string
          record_id: string
          added_by_id: string
          note: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      vault_documents: {
        Row: {
          id: string
          connection_id: string
          owner_id: string
          shared: boolean
          display_name: string
          category: VaultCategory
          document_date: string | null
          storage_path: string
          sha256_hash: string
          file_size_bytes: number
          content_type: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          owner_id: string
          shared?: boolean
          display_name: string
          category: VaultCategory
          document_date?: string | null
          storage_path: string
          sha256_hash: string
          file_size_bytes: number
          content_type: string
        }
        Update: {
          shared?: boolean
          display_name?: string
          category?: VaultCategory
          document_date?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          id: string
          user_id: string
          connection_id: string
          email_enabled: boolean
          push_enabled: boolean
          sms_enabled: boolean
          packing_reminder_enabled: boolean
          packing_reminder_lead_time: 'night_before' | 'morning_of' | '2_hours_before'
          handoff_prompt_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          connection_id: string
          email_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          packing_reminder_enabled?: boolean
          packing_reminder_lead_time?: 'night_before' | 'morning_of' | '2_hours_before'
          handoff_prompt_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          email_enabled?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          packing_reminder_enabled?: boolean
          packing_reminder_lead_time?: 'night_before' | 'morning_of' | '2_hours_before'
          handoff_prompt_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
        }
        Update: {
          p256dh?: string
          auth?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      switch_reminder_log: {
        Row: {
          id: string
          connection_id: string
          switch_date: string
          lead_time: 'night_before' | 'morning_of' | '2_hours_before'
          user_id: string
          sent_at: string
        }
        Insert: {
          id?: string
          connection_id: string
          switch_date: string
          lead_time: 'night_before' | 'morning_of' | '2_hours_before'
          user_id: string
          sent_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      switch_checklist_items: {
        Row: {
          id: string
          connection_id: string
          created_by_id: string
          item_text: string
          sort_order: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          connection_id: string
          created_by_id: string
          item_text: string
          sort_order?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          item_text?: string
          sort_order?: number
          active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      handoff_notes: {
        Row: {
          id: string
          connection_id: string
          from_user_id: string
          to_user_id: string
          content: string
          switch_date: string
          sent_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          connection_id: string
          from_user_id: string
          to_user_id: string
          content: string
          switch_date: string
          sent_at?: string
          read_at?: string | null
        }
        Update: {
          read_at?: string | null
        }
        Relationships: []
      }
      feedback_items: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          category: 'feature_request' | 'bug_report' | 'improvement' | 'question'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          category?: 'feature_request' | 'bug_report' | 'improvement' | 'question'
        }
        Update: {
          title?: string
          description?: string | null
          category?: 'feature_request' | 'bug_report' | 'improvement' | 'question'
        }
        Relationships: []
      }
      feedback_votes: {
        Row: {
          id: string
          user_id: string
          item_id: string
          value: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          item_id: string
          value: number
        }
        Update: {
          value?: number
        }
        Relationships: []
      }
      phone_verification_codes: {
        Row: {
          id: string
          user_id: string
          code: string
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          code: string
          expires_at?: string
          used_at?: string | null
        }
        Update: {
          used_at?: string | null
        }
        Relationships: []
      }
      child_health_conditions: {
        Row: { id: string; child_id: string; condition: string; diagnosed_date: string | null; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; condition: string; diagnosed_date?: string | null; notes?: string | null }
        Update: { condition?: string; diagnosed_date?: string | null; notes?: string | null; updated_at?: string }
        Relationships: []
      }
      child_immunizations: {
        Row: { id: string; child_id: string; vaccine: string; administered_date: string | null; provider: string | null; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; vaccine: string; administered_date?: string | null; provider?: string | null; notes?: string | null }
        Update: { vaccine?: string; administered_date?: string | null; provider?: string | null; notes?: string | null; updated_at?: string }
        Relationships: []
      }
      child_incidents: {
        Row: { id: string; child_id: string; incident_date: string | null; description: string; treatment: string | null; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; incident_date?: string | null; description: string; treatment?: string | null; notes?: string | null }
        Update: { incident_date?: string | null; description?: string; treatment?: string | null; notes?: string | null; updated_at?: string }
        Relationships: []
      }
      child_insurance: {
        Row: { id: string; child_id: string; provider_name: string; member_id: string | null; group_number: string | null; phone: string | null; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; provider_name: string; member_id?: string | null; group_number?: string | null; phone?: string | null; notes?: string | null }
        Update: { provider_name?: string; member_id?: string | null; group_number?: string | null; phone?: string | null; notes?: string | null; updated_at?: string }
        Relationships: []
      }
      child_teachers: {
        Row: { id: string; child_id: string; name: string; subject: string | null; email: string | null; phone: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; name: string; subject?: string | null; email?: string | null; phone?: string | null }
        Update: { name?: string; subject?: string | null; email?: string | null; phone?: string | null; updated_at?: string }
        Relationships: []
      }
      child_class_schedules: {
        Row: { id: string; child_id: string; subject: string; days: string[] | null; start_time: string | null; end_time: string | null; room: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; subject: string; days?: string[] | null; start_time?: string | null; end_time?: string | null; room?: string | null }
        Update: { subject?: string; days?: string[] | null; start_time?: string | null; end_time?: string | null; room?: string | null; updated_at?: string }
        Relationships: []
      }
      child_activities: {
        Row: { id: string; child_id: string; name: string; description: string | null; days: string[] | null; start_time: string | null; end_time: string | null; season_start: string | null; season_end: string | null; location: string | null; coach_name: string | null; coach_phone: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; name: string; description?: string | null; days?: string[] | null; start_time?: string | null; end_time?: string | null; season_start?: string | null; season_end?: string | null; location?: string | null; coach_name?: string | null; coach_phone?: string | null }
        Update: { name?: string; description?: string | null; days?: string[] | null; start_time?: string | null; end_time?: string | null; season_start?: string | null; season_end?: string | null; location?: string | null; coach_name?: string | null; coach_phone?: string | null; updated_at?: string }
        Relationships: []
      }
      child_contacts: {
        Row: { id: string; child_id: string; name: string; phone: string | null; email: string | null; relation: string | null; is_emergency: boolean; is_private: boolean; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; name: string; phone?: string | null; email?: string | null; relation?: string | null; is_emergency?: boolean; is_private?: boolean; created_by?: string | null }
        Update: { name?: string; phone?: string | null; email?: string | null; relation?: string | null; is_emergency?: boolean; is_private?: boolean; updated_at?: string }
        Relationships: []
      }
      child_procedures: {
        Row: { id: string; child_id: string; procedure: string; procedure_date: string | null; provider: string | null; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; procedure: string; procedure_date?: string | null; provider?: string | null; notes?: string | null }
        Update: { procedure?: string; procedure_date?: string | null; provider?: string | null; notes?: string | null; updated_at?: string }
        Relationships: []
      }
      child_test_results: {
        Row: { id: string; child_id: string; test_name: string; test_date: string | null; result: string | null; notes: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; child_id: string; test_name: string; test_date?: string | null; result?: string | null; notes?: string | null }
        Update: { test_name?: string; test_date?: string | null; result?: string | null; notes?: string | null; updated_at?: string }
        Relationships: []
      }
    }
    Views: {
      custody_schedule_current: {
        Row: {
          id: string
          connection_id: string
          date: string
          owner_id: string
          is_switch: boolean
          note: string | null
          created_at: string
          sha256_hash: string
          tsa_token: string | null
          import_id: string | null
          origin_platform: ImportPlatform | null
          origin_timestamp: string | null
          confirmed: boolean
          pending_schedule_id: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          id: string
          user_id: string
          title: string | null
          content: string
          mood: JournalMood | null
          tags: string[]
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          title?: string | null
          content: string
          mood?: JournalMood | null
          tags?: string[]
        }
        Update: {
          title?: string | null
          content?: string
          mood?: JournalMood | null
          tags?: string[]
          archived_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      journal_attachments: {
        Row: {
          id: string
          entry_id: string
          user_id: string
          storage_path: string
          file_name: string
          file_size: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          user_id?: string
          storage_path: string
          file_name: string
          file_size?: number | null
          mime_type?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      expo_push_tokens: {
        Row: {
          id: string
          user_id: string
          token: string
          platform: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          platform?: string | null
          updated_at?: string
        }
        Update: {
          token?: string
          platform?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: {
      connection_status: ConnectionStatus
      expense_category: ExpenseCategory
      expense_frequency: ExpenseFrequency
      expense_status: ExpenseStatus
      import_platform: ImportPlatform
      import_section: ImportSection
      import_status: ImportStatus
      message_via: MessageVia
      user_plan: UserPlan
    }
  }
}
