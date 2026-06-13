export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_alerts: {
        Row: {
          created_at: string
          id: string
          payload: Json
          resolved_at: string | null
          resolved_by: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          resolved_at?: string | null
          resolved_by?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_schedule: {
        Row: {
          business_id: string
          crosses_midnight: boolean
          day_of_week: number
          id: string
          is_open: boolean
          shift1_end: string | null
          shift1_start: string | null
          shift2_end: string | null
          shift2_start: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          crosses_midnight?: boolean
          day_of_week: number
          id?: string
          is_open?: boolean
          shift1_end?: string | null
          shift1_start?: string | null
          shift2_end?: string | null
          shift2_start?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          crosses_midnight?: boolean
          day_of_week?: number
          id?: string
          is_open?: boolean
          shift1_end?: string | null
          shift1_start?: string | null
          shift2_end?: string | null
          shift2_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_schedule_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          accent_color: string
          accepting_orders_until: string | null
          accepts_web_delivery: boolean
          accepts_web_pickup: boolean
          address: string | null
          balance_due: number
          banner_url: string | null
          block_reason: string | null
          blocked_for_debt: boolean
          categoria: string[] | null
          commission_override_far: number | null
          commission_override_near: number | null
          commission_override_pickup: number | null
          coordinates_lat: number | null
          coordinates_lng: number | null
          created_at: string
          delivery_fee: number
          estimated_eta_max: number
          estimated_eta_min: number
          id: string
          is_active: boolean
          is_blocked: boolean
          last_payment_at: string | null
          last_settlement_at: string | null
          logo_url: string | null
          name: string
          phone: string | null
          plin_number: string | null
          primary_capability:
            | Database["public"]["Enums"]["business_primary_capability"]
            | null
          publishes_catalog: boolean
          qr_url: string | null
          tagline: string | null
          updated_at: string
          user_id: string
          uses_tindivo_drivers: boolean
          yape_number: string | null
        }
        Insert: {
          accent_color?: string
          accepting_orders_until?: string | null
          accepts_web_delivery?: boolean
          accepts_web_pickup?: boolean
          address?: string | null
          balance_due?: number
          banner_url?: string | null
          block_reason?: string | null
          blocked_for_debt?: boolean
          categoria?: string[] | null
          commission_override_far?: number | null
          commission_override_near?: number | null
          commission_override_pickup?: number | null
          coordinates_lat?: number | null
          coordinates_lng?: number | null
          created_at?: string
          delivery_fee?: number
          estimated_eta_max?: number
          estimated_eta_min?: number
          id?: string
          is_active?: boolean
          is_blocked?: boolean
          last_payment_at?: string | null
          last_settlement_at?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          plin_number?: string | null
          primary_capability?:
            | Database["public"]["Enums"]["business_primary_capability"]
            | null
          publishes_catalog?: boolean
          qr_url?: string | null
          tagline?: string | null
          updated_at?: string
          user_id: string
          uses_tindivo_drivers?: boolean
          yape_number?: string | null
        }
        Update: {
          accent_color?: string
          accepting_orders_until?: string | null
          accepts_web_delivery?: boolean
          accepts_web_pickup?: boolean
          address?: string | null
          balance_due?: number
          banner_url?: string | null
          block_reason?: string | null
          blocked_for_debt?: boolean
          categoria?: string[] | null
          commission_override_far?: number | null
          commission_override_near?: number | null
          commission_override_pickup?: number | null
          coordinates_lat?: number | null
          coordinates_lng?: number | null
          created_at?: string
          delivery_fee?: number
          estimated_eta_max?: number
          estimated_eta_min?: number
          id?: string
          is_active?: boolean
          is_blocked?: boolean
          last_payment_at?: string | null
          last_settlement_at?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          plin_number?: string | null
          primary_capability?:
            | Database["public"]["Enums"]["business_primary_capability"]
            | null
          publishes_catalog?: boolean
          qr_url?: string | null
          tagline?: string | null
          updated_at?: string
          user_id?: string
          uses_tindivo_drivers?: boolean
          yape_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_settlements: {
        Row: {
          business_id: string
          confirmed_amount: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          delivered_amount: number | null
          delivered_at_ts: string | null
          dispute_note: string | null
          disputed_at: string | null
          driver_id: string
          id: string
          order_count: number
          reported_amount: number | null
          resolution_note: string | null
          resolved_amount: number | null
          resolved_at: string | null
          resolved_by: string | null
          settlement_date: string
          status: Database["public"]["Enums"]["cash_settlement_status"]
          total_cash: number
          updated_at: string
        }
        Insert: {
          business_id: string
          confirmed_amount?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          delivered_amount?: number | null
          delivered_at_ts?: string | null
          dispute_note?: string | null
          disputed_at?: string | null
          driver_id: string
          id?: string
          order_count?: number
          reported_amount?: number | null
          resolution_note?: string | null
          resolved_amount?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          settlement_date: string
          status?: Database["public"]["Enums"]["cash_settlement_status"]
          total_cash?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          confirmed_amount?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          delivered_amount?: number | null
          delivered_at_ts?: string | null
          dispute_note?: string | null
          disputed_at?: string | null
          driver_id?: string
          id?: string
          order_count?: number
          reported_amount?: number | null
          resolution_note?: string | null
          resolved_amount?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          settlement_date?: string
          status?: Database["public"]["Enums"]["cash_settlement_status"]
          total_cash?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_settlements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_settlements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_settlements_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_settlements_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contingency_advances: {
        Row: {
          actor_charged: Database["public"]["Enums"]["contingency_actor_charged"]
          amount: number
          created_at: string
          customer_phone: string | null
          customer_user_id: string | null
          dispute_note: string | null
          disputed_at: string | null
          id: string
          operator: string | null
          order_id: string
          proof_url: string | null
          reason: string
          replenished_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["contingency_advance_status"]
          updated_at: string
        }
        Insert: {
          actor_charged: Database["public"]["Enums"]["contingency_actor_charged"]
          amount: number
          created_at?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          dispute_note?: string | null
          disputed_at?: string | null
          id?: string
          operator?: string | null
          order_id: string
          proof_url?: string | null
          reason: string
          replenished_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["contingency_advance_status"]
          updated_at?: string
        }
        Update: {
          actor_charged?: Database["public"]["Enums"]["contingency_actor_charged"]
          amount?: number
          created_at?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          dispute_note?: string | null
          disputed_at?: string | null
          id?: string
          operator?: string | null
          order_id?: string
          proof_url?: string | null
          reason?: string
          replenished_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["contingency_advance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contingency_advances_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contingency_advances_operator_fkey"
            columns: ["operator"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contingency_advances_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contingency_advances_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          coordinates_lat: number | null
          coordinates_lng: number | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          line: string | null
          reference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coordinates_lat?: number | null
          coordinates_lng?: number | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          line?: string | null
          reference: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coordinates_lat?: number | null
          coordinates_lng?: number | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          line?: string | null
          reference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_incidents: {
        Row: {
          created_at: string
          customer_phone: string
          customer_user_id: string | null
          delivery_reference: string | null
          description: string | null
          id: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          is_strike: boolean
          order_id: string | null
          reported_by: string | null
          reported_by_role: string | null
          review_result: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_phone: string
          customer_user_id?: string | null
          delivery_reference?: string | null
          description?: string | null
          id?: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          is_strike?: boolean
          order_id?: string | null
          reported_by?: string | null
          reported_by_role?: string | null
          review_result?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_phone?: string
          customer_user_id?: string | null
          delivery_reference?: string | null
          description?: string | null
          id?: string
          incident_type?: Database["public"]["Enums"]["incident_type"]
          is_strike?: boolean
          order_id?: string | null
          reported_by?: string | null
          reported_by_role?: string | null
          review_result?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_incidents_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_incidents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_incidents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_item_modifiers: {
        Row: {
          additional_price_snapshot: number
          created_at: string
          group_name_snapshot: string
          id: string
          item_id: string
          option_name_snapshot: string
        }
        Insert: {
          additional_price_snapshot: number
          created_at?: string
          group_name_snapshot: string
          id?: string
          item_id: string
          option_name_snapshot: string
        }
        Update: {
          additional_price_snapshot?: number
          created_at?: string
          group_name_snapshot?: string
          id?: string
          item_id?: string
          option_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_item_modifiers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "customer_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_items: {
        Row: {
          base_price_snapshot: number
          created_at: string
          id: string
          item_name_snapshot: string
          line_total: number
          menu_item_id: string | null
          note: string | null
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          base_price_snapshot: number
          created_at?: string
          id?: string
          item_name_snapshot: string
          line_total: number
          menu_item_id?: string | null
          note?: string | null
          order_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          base_price_snapshot?: number
          created_at?: string
          id?: string
          item_name_snapshot?: string
          line_total?: number
          menu_item_id?: string | null
          note?: string | null
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          blocked_until: string | null
          contraentrega_blocked: boolean
          created_at: string
          default_address: string | null
          default_coordinates_lat: number | null
          default_coordinates_lng: number | null
          default_location_accuracy_m: number | null
          default_reference: string | null
          full_name: string
          phone: string | null
          phone_verified_at: string | null
          strikes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_until?: string | null
          contraentrega_blocked?: boolean
          created_at?: string
          default_address?: string | null
          default_coordinates_lat?: number | null
          default_coordinates_lng?: number | null
          default_location_accuracy_m?: number | null
          default_reference?: string | null
          full_name: string
          phone?: string | null
          phone_verified_at?: string | null
          strikes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_until?: string | null
          contraentrega_blocked?: boolean
          created_at?: string
          default_address?: string | null
          default_coordinates_lat?: number | null
          default_coordinates_lng?: number | null
          default_location_accuracy_m?: number | null
          default_reference?: string | null
          full_name?: string
          phone?: string | null
          phone_verified_at?: string | null
          strikes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_strikes: {
        Row: {
          created_at: string
          customer_user_id: string | null
          delivery_coordinates_lat: number | null
          delivery_coordinates_lng: number | null
          delivery_reference: string | null
          id: string
          order_id: string | null
          phone: string
          reason: string
          reported_by: string | null
        }
        Insert: {
          created_at?: string
          customer_user_id?: string | null
          delivery_coordinates_lat?: number | null
          delivery_coordinates_lng?: number | null
          delivery_reference?: string | null
          id?: string
          order_id?: string | null
          phone: string
          reason?: string
          reported_by?: string | null
        }
        Update: {
          created_at?: string
          customer_user_id?: string | null
          delivery_coordinates_lat?: number | null
          delivery_coordinates_lng?: number | null
          delivery_reference?: string | null
          id?: string
          order_id?: string | null
          phone?: string
          reason?: string
          reported_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_strikes_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_strikes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_strikes_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          event_type: string
          id: string
          last_error: string | null
          metadata: Json
          occurred_at: string
          payload: Json
          published_at: string | null
          retry_count: number
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          event_type: string
          id?: string
          last_error?: string | null
          metadata?: Json
          occurred_at?: string
          payload: Json
          published_at?: string | null
          retry_count?: number
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          event_type?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          occurred_at?: string
          payload?: Json
          published_at?: string | null
          retry_count?: number
        }
        Relationships: []
      }
      driver_availability: {
        Row: {
          driver_id: string
          is_available: boolean
          last_seen_at: string | null
          shift_started_at: string | null
          updated_at: string
        }
        Insert: {
          driver_id: string
          is_available?: boolean
          last_seen_at?: string | null
          shift_started_at?: string | null
          updated_at?: string
        }
        Update: {
          driver_id?: string
          is_available?: boolean
          last_seen_at?: string | null
          shift_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_availability_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_restaurants: {
        Row: {
          business_id: string
          driver_id: string
          granted_at: string
          granted_by: string | null
        }
        Insert: {
          business_id: string
          driver_id: string
          granted_at?: string
          granted_by?: string | null
        }
        Update: {
          business_id?: string
          driver_id?: string
          granted_at?: string
          granted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_restaurants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_restaurants_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_restaurants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          license_plate: string | null
          operating_days: string[]
          phone: string
          shift_end: string
          shift_start: string
          updated_at: string
          user_id: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          license_plate?: string | null
          operating_days?: string[]
          phone: string
          shift_end?: string
          shift_start?: string
          updated_at?: string
          user_id: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          license_plate?: string | null
          operating_days?: string[]
          phone?: string
          shift_end?: string
          shift_start?: string
          updated_at?: string
          user_id?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "drivers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_coverage_claims: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          evidence_url: string | null
          id: string
          order_id: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["fraud_claim_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          evidence_url?: string | null
          id?: string
          order_id: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["fraud_claim_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          evidence_url?: string | null
          id?: string
          order_id?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["fraud_claim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_coverage_claims_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_coverage_claims_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_coverage_claims_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_coverage_claims_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          request_hash: string
          response_body: Json | null
          response_status: number | null
          scope: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          key: string
          request_hash: string
          response_body?: Json | null
          response_status?: number | null
          scope: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          request_hash?: string
          response_body?: Json | null
          response_status?: number | null
          scope?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          blurb: string | null
          business_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          blurb?: string | null
          business_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          blurb?: string | null
          business_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifier_groups: {
        Row: {
          display_order: number
          group_id: string
          item_id: string
        }
        Insert: {
          display_order?: number
          group_id: string
          item_id: string
        }
        Update: {
          display_order?: number
          group_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "menu_modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          badges: string[]
          base_price: number
          business_id: string
          category_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_hue: number | null
          image_url: string | null
          is_available: boolean
          is_compact: boolean
          name: string
          updated_at: string
        }
        Insert: {
          badges?: string[]
          base_price: number
          business_id: string
          category_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_hue?: number | null
          image_url?: string | null
          is_available?: boolean
          is_compact?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          badges?: string[]
          base_price?: number
          business_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_hue?: number | null
          image_url?: string | null
          is_available?: boolean
          is_compact?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_modifier_groups: {
        Row: {
          business_id: string
          created_at: string
          display_order: number
          id: string
          is_required: boolean
          max_selections: number | null
          min_selections: number
          name: string
          selection_type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean
          max_selections?: number | null
          min_selections?: number
          name: string
          selection_type: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean
          max_selections?: number | null
          min_selections?: number
          name?: string
          selection_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_modifier_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_modifier_options: {
        Row: {
          additional_price: number
          created_at: string
          description: string | null
          display_order: number
          group_id: string
          id: string
          is_available: boolean
          name: string
        }
        Insert: {
          additional_price?: number
          created_at?: string
          description?: string | null
          display_order?: number
          group_id: string
          id?: string
          is_available?: boolean
          name: string
        }
        Update: {
          additional_price?: number
          created_at?: string
          description?: string | null
          display_order?: number
          group_id?: string
          id?: string
          is_available?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "menu_modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_assignment_rejections: {
        Row: {
          driver_id: string
          expires_at: string
          id: string
          order_id: string
          reason: string | null
          rejected_at: string
        }
        Insert: {
          driver_id: string
          expires_at?: string
          id?: string
          order_id: string
          reason?: string | null
          rejected_at?: string
        }
        Update: {
          driver_id?: string
          expires_at?: string
          id?: string
          order_id?: string
          reason?: string | null
          rejected_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_assignment_rejections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignment_rejections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_event_log: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          data: Json
          event_type: string
          id: string
          order_id: string
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          data?: Json
          event_type: string
          id?: string
          order_id: string
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          data?: Json
          event_type?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_event_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_event_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          notes: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          notes?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_transfer_requests: {
        Row: {
          created_at: string
          expires_at: string | null
          from_driver_id: string
          id: string
          order_id: string
          reason: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["transfer_request_status"]
          to_driver_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          from_driver_id: string
          id?: string
          order_id: string
          reason?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["transfer_request_status"]
          to_driver_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          from_driver_id?: string
          id?: string
          order_id?: string
          reason?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["transfer_request_status"]
          to_driver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_transfer_requests_from_driver_id_fkey"
            columns: ["from_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_transfer_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_transfer_requests_to_driver_id_fkey"
            columns: ["to_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          appears_in_queue_at: string | null
          assigned_at: string | null
          business_id: string
          business_notes: string | null
          cancel_note: string | null
          cancel_reason: Database["public"]["Enums"]["cancel_reason"] | null
          cancelled_at: string | null
          cancelled_by: string | null
          cash_amount: number | null
          cash_owed_at_delivery: number | null
          change_to_give: number | null
          client_pays_with: number | null
          comprobante_prepago_url: string | null
          confirmed_at: string | null
          created_at: string
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_user_id: string | null
          customer_gps_accuracy_m: number | null
          customer_gps_distance_to_center_km: number | null
          customer_gps_lat: number | null
          customer_gps_lng: number | null
          customer_gps_method: string | null
          customer_gps_validated_at: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_coordinates_lat: number | null
          delivery_coordinates_lng: number | null
          delivery_distance_band:
            | Database["public"]["Enums"]["distance_band"]
            | null
          delivery_fee: number
          delivery_maps_url: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method"]
          delivery_reference: string | null
          driver_id: string | null
          driver_notes: string | null
          estimated_ready_at: string | null
          heading_at: string | null
          id: string
          is_manual: boolean | null
          occupancy_slots: number
          order_amount: number
          order_number: number
          payment_intent: Database["public"]["Enums"]["payment_intent"]
          payment_proof_status: string | null
          payment_real: Database["public"]["Enums"]["payment_real"] | null
          payment_verified_at: string | null
          payment_verified_by: string | null
          pending_acceptance_at: string | null
          picked_up_at: string | null
          prep_extended_at: string | null
          prep_extension_count: number
          prep_time_minutes: number | null
          preparing_at: string | null
          ready_early_used: boolean
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason_code: string | null
          rejection_reason_text: string | null
          requires_validation: boolean
          risk_flags: Json
          short_id: string
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          tindivo_commission: number | null
          tracking_link_sent_at: string | null
          tracking_link_sent_by: string | null
          updated_at: string
          urgent_since: string | null
          validated_at: string | null
          validated_by: string | null
          validating_at: string | null
          validation_result: string | null
          validation_reason_code: string | null
          waiting_at_restaurant_at: string | null
          waiting_driver_at: string | null
          yape_amount: number | null
          yape_confirmed: boolean
        }
        Insert: {
          appears_in_queue_at?: string | null
          assigned_at?: string | null
          business_id: string
          business_notes?: string | null
          cancel_note?: string | null
          cancel_reason?: Database["public"]["Enums"]["cancel_reason"] | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_amount?: number | null
          cash_owed_at_delivery?: number | null
          change_to_give?: number | null
          client_pays_with?: number | null
          comprobante_prepago_url?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_notes?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          customer_gps_accuracy_m?: number | null
          customer_gps_distance_to_center_km?: number | null
          customer_gps_lat?: number | null
          customer_gps_lng?: number | null
          customer_gps_method?: string | null
          customer_gps_validated_at?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_coordinates_lat?: number | null
          delivery_coordinates_lng?: number | null
          delivery_distance_band?:
            | Database["public"]["Enums"]["distance_band"]
            | null
          delivery_fee: number
          delivery_maps_url?: string | null
          delivery_method?: Database["public"]["Enums"]["delivery_method"]
          delivery_reference?: string | null
          driver_id?: string | null
          driver_notes?: string | null
          estimated_ready_at?: string | null
          heading_at?: string | null
          id?: string
          is_manual?: boolean | null
          occupancy_slots?: number
          order_amount: number
          order_number?: number
          payment_intent: Database["public"]["Enums"]["payment_intent"]
          payment_proof_status?: string | null
          payment_real?: Database["public"]["Enums"]["payment_real"] | null
          payment_verified_at?: string | null
          payment_verified_by?: string | null
          pending_acceptance_at?: string | null
          picked_up_at?: string | null
          prep_extended_at?: string | null
          prep_extension_count?: number
          prep_time_minutes?: number | null
          preparing_at?: string | null
          ready_early_used?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason_code?: string | null
          rejection_reason_text?: string | null
          requires_validation?: boolean
          risk_flags?: Json
          short_id: string
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          tindivo_commission?: number | null
          tracking_link_sent_at?: string | null
          tracking_link_sent_by?: string | null
          updated_at?: string
          urgent_since?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validating_at?: string | null
          validation_result?: string | null
          validation_reason_code?: string | null
          waiting_at_restaurant_at?: string | null
          waiting_driver_at?: string | null
          yape_amount?: number | null
          yape_confirmed?: boolean
        }
        Update: {
          appears_in_queue_at?: string | null
          assigned_at?: string | null
          business_id?: string
          business_notes?: string | null
          cancel_note?: string | null
          cancel_reason?: Database["public"]["Enums"]["cancel_reason"] | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_amount?: number | null
          cash_owed_at_delivery?: number | null
          change_to_give?: number | null
          client_pays_with?: number | null
          comprobante_prepago_url?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_notes?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          customer_gps_accuracy_m?: number | null
          customer_gps_distance_to_center_km?: number | null
          customer_gps_lat?: number | null
          customer_gps_lng?: number | null
          customer_gps_method?: string | null
          customer_gps_validated_at?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_coordinates_lat?: number | null
          delivery_coordinates_lng?: number | null
          delivery_distance_band?:
            | Database["public"]["Enums"]["distance_band"]
            | null
          delivery_fee?: number
          delivery_maps_url?: string | null
          delivery_method?: Database["public"]["Enums"]["delivery_method"]
          delivery_reference?: string | null
          driver_id?: string | null
          driver_notes?: string | null
          estimated_ready_at?: string | null
          heading_at?: string | null
          id?: string
          is_manual?: boolean | null
          occupancy_slots?: number
          order_amount?: number
          order_number?: number
          payment_intent?: Database["public"]["Enums"]["payment_intent"]
          payment_proof_status?: string | null
          payment_real?: Database["public"]["Enums"]["payment_real"] | null
          payment_verified_at?: string | null
          payment_verified_by?: string | null
          pending_acceptance_at?: string | null
          picked_up_at?: string | null
          prep_extended_at?: string | null
          prep_extension_count?: number
          prep_time_minutes?: number | null
          preparing_at?: string | null
          ready_early_used?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason_code?: string | null
          rejection_reason_text?: string | null
          requires_validation?: boolean
          risk_flags?: Json
          short_id?: string
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          tindivo_commission?: number | null
          tracking_link_sent_at?: string | null
          tracking_link_sent_by?: string | null
          updated_at?: string
          urgent_since?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validating_at?: string | null
          validation_result?: string | null
          validation_reason_code?: string | null
          waiting_at_restaurant_at?: string | null
          waiting_driver_at?: string | null
          yape_amount?: number | null
          yape_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_verified_by_fkey"
            columns: ["payment_verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tracking_link_sent_by_fkey"
            columns: ["tracking_link_sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_delivery_log: {
        Row: {
          at: string
          error_code: number | null
          error_message: string | null
          event_type: string
          id: string
          status: string
          subscription_id: string | null
        }
        Insert: {
          at?: string
          error_code?: number | null
          error_message?: string | null
          event_type: string
          id?: string
          status: string
          subscription_id?: string | null
        }
        Update: {
          at?: string
          error_code?: number | null
          error_message?: string | null
          event_type?: string
          id?: string
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_delivery_log_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_failed_at: string | null
          last_successful_at: string | null
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_failed_at?: string | null
          last_successful_at?: string | null
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_failed_at?: string | null
          last_successful_at?: string | null
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          business_id: string | null
          created_at: string
          created_by: string | null
          customer_phone: string | null
          customer_user_id: string | null
          description: string | null
          driver_id: string | null
          evidence_url: string | null
          id: string
          order_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          type: Database["public"]["Enums"]["report_type"]
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          description?: string | null
          driver_id?: string | null
          evidence_url?: string | null
          id?: string
          order_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          type: Database["public"]["Enums"]["report_type"]
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          description?: string | null
          driver_id?: string | null
          evidence_url?: string | null
          id?: string
          order_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          type?: Database["public"]["Enums"]["report_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          note: string | null
          paid_at: string
          payment_method: string
          registered_by: string | null
          settlement_id: string | null
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          id?: string
          note?: string | null
          paid_at: string
          payment_method: string
          registered_by?: string | null
          settlement_id?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          note?: string | null
          paid_at?: string
          payment_method?: string
          registered_by?: string | null
          settlement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payments_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          due_date: string
          excluded_reason: string | null
          id: string
          order_count: number
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          payment_note: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["settlement_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          due_date: string
          excluded_reason?: string | null
          id?: string
          order_count?: number
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          payment_note?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["settlement_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          excluded_reason?: string | null
          id?: string
          order_count?: number
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          payment_note?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["settlement_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_acceptance: {
        Row: {
          accepted_at: string
          id: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          id?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_acceptance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          primary_role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          primary_role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          primary_role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_metrics: { Args: { p_from: string; p_to: string }; Returns: Json }
      advance_order: {
        Args: {
          p_action: string
          p_actor_role: Database["public"]["Enums"]["user_role"]
          p_actor_user_id: string
          p_order_id: string
          p_params?: Json
        }
        Returns: Json
      }
      apply_order_transfer: {
        Args: {
          p_final: Database["public"]["Enums"]["transfer_request_status"]
          p_req: Database["public"]["Tables"]["order_transfer_requests"]["Row"]
        }
        Returns: undefined
      }
      auto_confirm_cash_settlement: { Args: { p_id: string }; Returns: Json }
      block_business: {
        Args: { p_by: string; p_id: string; p_reason: string }
        Returns: Json
      }
      cancel_customer_order: {
        Args: { p_customer_user_id: string; p_order_id: string }
        Returns: Json
      }
      close_drivers_outside_schedule: { Args: never; Returns: number }
      confirm_cash_settlement: {
        Args: {
          p_business_user_id: string
          p_confirmed_amount: number
          p_id: string
        }
        Returns: Json
      }
      create_business_manual_order: {
        Args: {
          p_business_user_id: string
          p_cash_amount?: number
          p_client_pays_with?: number
          p_customer_name?: string
          p_customer_phone?: string
          p_delivery_method: Database["public"]["Enums"]["delivery_method"]
          p_delivery_reference?: string
          p_notes?: string
          p_order_amount: number
          p_payment_intent: Database["public"]["Enums"]["payment_intent"]
          p_prep_time_minutes?: number
          p_yape_amount?: number
        }
        Returns: Json
      }
      create_cash_settlement: {
        Args: {
          p_business_id: string
          p_delivered_amount?: number
          p_driver_user_id: string
          p_settlement_date: string
        }
        Returns: Json
      }
      create_contingency_advance: {
        Args: {
          p_actor_charged: Database["public"]["Enums"]["contingency_actor_charged"]
          p_amount: number
          p_operator: string
          p_order_id: string
          p_proof_url?: string
          p_reason: string
        }
        Returns: Json
      }
      create_customer_incident: {
        Args: {
          p_description?: string
          p_incident_type: Database["public"]["Enums"]["incident_type"]
          p_order_id: string
          p_reported_by: string
          p_reported_by_role: string
        }
        Returns: {
          created_at: string
          customer_phone: string
          customer_user_id: string | null
          delivery_reference: string | null
          description: string | null
          id: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          is_strike: boolean
          order_id: string | null
          reported_by: string | null
          reported_by_role: string | null
          review_result: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_incidents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_customer_order: {
        Args: {
          p_business_id: string
          p_client_pays_with?: number
          p_customer_gps_accuracy_m?: number
          p_customer_gps_distance_to_center_km?: number
          p_customer_gps_lat?: number
          p_customer_gps_lng?: number
          p_customer_gps_method?: string
          p_customer_name: string
          p_customer_phone: string
          p_customer_user_id: string
          p_delivery_address?: string
          p_delivery_lat?: number
          p_delivery_lng?: number
          p_delivery_method: Database["public"]["Enums"]["delivery_method"]
          p_delivery_reference?: string
          p_items: Json
          p_payment_intent: Database["public"]["Enums"]["payment_intent"]
          p_source?: Database["public"]["Enums"]["order_source"]
        }
        Returns: Json
      }
      create_fraud_claim: {
        Args: {
          p_amount: number
          p_business_user_id: string
          p_evidence_url?: string
          p_order_id: string
          p_reason: string
        }
        Returns: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          evidence_url: string | null
          id: string
          order_id: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["fraud_claim_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fraud_coverage_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_business_id: { Args: never; Returns: string }
      current_driver_id: { Args: never; Returns: string }
      current_user_has_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      current_user_role: { Args: never; Returns: string }
      customer_contraentrega_blocked: {
        Args: { p_phone: string; p_reference: string }
        Returns: boolean
      }
      customer_is_blocked: {
        Args: { p_phone: string; p_user_id: string }
        Returns: boolean
      }
      customer_requires_prepayment: {
        Args: { p_phone: string; p_reference: string; p_user_id: string }
        Returns: boolean
      }
      derive_business_primary_capability: {
        Args: {
          p_accepts_web_delivery: boolean
          p_accepts_web_pickup: boolean
          p_publishes_catalog: boolean
          p_uses_tindivo_drivers: boolean
        }
        Returns: Database["public"]["Enums"]["business_primary_capability"]
      }
      dispute_cash_settlement: {
        Args: {
          p_business_user_id: string
          p_id: string
          p_note: string
          p_reported_amount: number
        }
        Returns: Json
      }
      dispute_contingency_advance: {
        Args: {
          p_advance_id: string
          p_business_user_id: string
          p_note: string
        }
        Returns: Json
      }
      expire_order: {
        Args: {
          p_order_id: string
          p_reason: Database["public"]["Enums"]["cancel_reason"]
        }
        Returns: Json
      }
      expire_order_transfers: { Args: never; Returns: number }
      extend_order_prep: {
        Args: { p_business_user_id: string; p_order_id: string }
        Returns: Json
      }
      generate_settlements: {
        Args: {
          p_created_by?: string
          p_due_date: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      generate_short_id: { Args: never; Returns: string }
      get_tracking: { Args: { p_short_id: string }; Returns: Json }
      is_published_business: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      is_within_platform_schedule: { Args: never; Returns: boolean }
      pause_business_orders: {
        Args: { p_business_user_id: string; p_minutes?: number }
        Returns: Json
      }
      pay_settlement: {
        Args: {
          p_method?: string
          p_note?: string
          p_paid_by: string
          p_settlement_id: string
        }
        Returns: Json
      }
      request_order_transfer: {
        Args: {
          p_order_id: string
          p_reason?: string
          p_to_driver_user_id: string
        }
        Returns: Json
      }
      request_order_validation: {
        Args: { p_business_user_id: string; p_order_id: string }
        Returns: {
          appears_in_queue_at: string | null
          assigned_at: string | null
          business_id: string
          business_notes: string | null
          cancel_note: string | null
          cancel_reason: Database["public"]["Enums"]["cancel_reason"] | null
          cancelled_at: string | null
          cancelled_by: string | null
          cash_amount: number | null
          cash_owed_at_delivery: number | null
          change_to_give: number | null
          client_pays_with: number | null
          comprobante_prepago_url: string | null
          confirmed_at: string | null
          created_at: string
          customer_name: string | null
          customer_notes: string | null
          customer_phone: string | null
          customer_user_id: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_coordinates_lat: number | null
          delivery_coordinates_lng: number | null
          delivery_distance_band:
            | Database["public"]["Enums"]["distance_band"]
            | null
          delivery_fee: number
          delivery_maps_url: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method"]
          delivery_reference: string | null
          driver_id: string | null
          driver_notes: string | null
          estimated_ready_at: string | null
          heading_at: string | null
          id: string
          is_manual: boolean | null
          occupancy_slots: number
          order_amount: number
          order_number: number
          payment_intent: Database["public"]["Enums"]["payment_intent"]
          payment_proof_status: string | null
          payment_real: Database["public"]["Enums"]["payment_real"] | null
          payment_verified_at: string | null
          payment_verified_by: string | null
          pending_acceptance_at: string | null
          picked_up_at: string | null
          prep_extended_at: string | null
          prep_extension_count: number
          prep_time_minutes: number | null
          preparing_at: string | null
          ready_early_used: boolean
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason_code: string | null
          rejection_reason_text: string | null
          requires_validation: boolean
          short_id: string
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          tindivo_commission: number | null
          tracking_link_sent_at: string | null
          tracking_link_sent_by: string | null
          updated_at: string
          urgent_since: string | null
          validated_at: string | null
          validated_by: string | null
          validating_at: string | null
          validation_result: string | null
          waiting_at_restaurant_at: string | null
          waiting_driver_at: string | null
          yape_amount: number | null
          yape_confirmed: boolean
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_cash_settlement: {
        Args: {
          p_admin_user_id: string
          p_id: string
          p_note: string
          p_resolved_amount: number
        }
        Returns: Json
      }
      resolve_contingency_advance: {
        Args: {
          p_advance_id: string
          p_note: string
          p_resolved_amount: number
          p_resolved_by: string
        }
        Returns: Json
      }
      resolve_fraud_claim: {
        Args: {
          p_approve: boolean
          p_claim_id: string
          p_note?: string
          p_resolver: string
        }
        Returns: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          evidence_url: string | null
          id: string
          order_id: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["fraud_claim_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fraud_coverage_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_order_transfer: {
        Args: {
          p_accept: boolean
          p_request_id: string
          p_responder_user_id: string
        }
        Returns: Json
      }
      resume_business_orders: {
        Args: { p_business_user_id: string }
        Returns: Json
      }
      review_customer_incident: {
        Args: { p_incident_id: string; p_result: string; p_reviewer: string }
        Returns: {
          created_at: string
          customer_phone: string
          customer_user_id: string | null
          delivery_reference: string | null
          description: string | null
          id: string
          incident_type: Database["public"]["Enums"]["incident_type"]
          is_strike: boolean
          order_id: string | null
          reported_by: string | null
          reported_by_role: string | null
          review_result: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_incidents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_driver_availability: {
        Args: { p_available: boolean; p_user_id: string }
        Returns: Json
      }
      unblock_business: { Args: { p_by: string; p_id: string }; Returns: Json }
      validate_order: {
        Args: {
          p_actor_role: Database["public"]["Enums"]["user_role"]
          p_actor_user_id: string
          p_order_id: string
          p_pass: boolean
          p_reason?: string
          p_reason_code?: string
        }
        Returns: Json
      }
    }
    Enums: {
      business_primary_capability:
        | "drivers_only"
        | "catalog_pickup"
        | "catalog_delivery"
        | "catalog_full"
        | "pickup_local"
      cancel_reason:
        | "pending_acceptance_timeout"
        | "validation_timeout"
        | "prepay_timeout"
        | "business_cancelled"
        | "admin_cancelled"
        | "customer_cancelled"
        | "no_show"
      cash_settlement_status:
        | "pending"
        | "pending_confirmation"
        | "confirmed"
        | "disputed"
        | "resolved"
        | "auto_assumed_confirmed"
      contingency_actor_charged: "restaurante" | "tindivo"
      contingency_advance_status: "activo" | "disputado" | "cancelado"
      delivery_method: "delivery" | "pickup"
      distance_band: "near" | "far"
      fraud_claim_status: "pending" | "approved" | "rejected"
      incident_type:
        | "no_show"
        | "fake_address"
        | "customer_abuse"
        | "payment_fraud"
        | "rejected_proof"
        | "other"
      order_source: "customer_pwa" | "business_manual"
      order_status:
        | "validando"
        | "pending_acceptance"
        | "confirmed"
        | "preparing"
        | "waiting_driver"
        | "heading_to_restaurant"
        | "waiting_at_restaurant"
        | "picked_up"
        | "delivered"
        | "cancelled"
      payment_intent:
        | "prepaid"
        | "pending_yape"
        | "pending_cash"
        | "pending_mixed"
      payment_real:
        | "paid_prepaid"
        | "paid_yape"
        | "paid_cash"
        | "paid_mixed"
        | "unpaid"
        | "refunded"
      report_status: "open" | "resolved" | "dismissed"
      report_type:
        | "no_show"
        | "rejected_proof_disputed"
        | "cash_difference"
        | "restaurant_fake"
        | "strike_reactivation"
        | "advance_dispute"
      settlement_status: "pending" | "paid" | "overdue" | "cancelled"
      transfer_request_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "expired"
        | "invalidated"
      user_role: "customer" | "business" | "driver" | "admin"
      vehicle_type: "moto" | "bici" | "pie" | "auto"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      business_primary_capability: [
        "drivers_only",
        "catalog_pickup",
        "catalog_delivery",
        "catalog_full",
        "pickup_local",
      ],
      cancel_reason: [
        "pending_acceptance_timeout",
        "validation_timeout",
        "prepay_timeout",
        "business_cancelled",
        "admin_cancelled",
        "customer_cancelled",
        "no_show",
      ],
      cash_settlement_status: [
        "pending",
        "pending_confirmation",
        "confirmed",
        "disputed",
        "resolved",
        "auto_assumed_confirmed",
      ],
      contingency_actor_charged: ["restaurante", "tindivo"],
      contingency_advance_status: ["activo", "disputado", "cancelado"],
      delivery_method: ["delivery", "pickup"],
      distance_band: ["near", "far"],
      fraud_claim_status: ["pending", "approved", "rejected"],
      incident_type: [
        "no_show",
        "fake_address",
        "customer_abuse",
        "payment_fraud",
        "rejected_proof",
        "other",
      ],
      order_source: ["customer_pwa", "business_manual"],
      order_status: [
        "validando",
        "pending_acceptance",
        "confirmed",
        "preparing",
        "waiting_driver",
        "heading_to_restaurant",
        "waiting_at_restaurant",
        "picked_up",
        "delivered",
        "cancelled",
      ],
      payment_intent: [
        "prepaid",
        "pending_yape",
        "pending_cash",
        "pending_mixed",
      ],
      payment_real: [
        "paid_prepaid",
        "paid_yape",
        "paid_cash",
        "paid_mixed",
        "unpaid",
        "refunded",
      ],
      report_status: ["open", "resolved", "dismissed"],
      report_type: [
        "no_show",
        "rejected_proof_disputed",
        "cash_difference",
        "restaurant_fake",
        "strike_reactivation",
        "advance_dispute",
      ],
      settlement_status: ["pending", "paid", "overdue", "cancelled"],
      transfer_request_status: [
        "pending",
        "accepted",
        "rejected",
        "expired",
        "invalidated",
      ],
      user_role: ["customer", "business", "driver", "admin"],
      vehicle_type: ["moto", "bici", "pie", "auto"],
    },
  },
} as const
