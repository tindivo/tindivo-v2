export interface Address {
  id: string
  label: string
  line: string | null
  reference: string
  is_default: boolean
  coordinates_lat: number | null
  coordinates_lng: number | null
}

export interface OrderRow {
  id: string
  short_id: string
  status: string
  order_amount: number
  created_at: string
}

export interface Profile {
  name: string
  email: string
  phone: string
  phone_verified_at?: string | null
}

export interface ProfileStep {
  id: 'name' | 'phone' | 'address'
  title: string
  description: string
  isCompleted: boolean
  actionLabel: string
}
