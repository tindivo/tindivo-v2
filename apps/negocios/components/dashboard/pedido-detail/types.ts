export interface DetailItem {
  qty: number
  name: string
  mods: string | null
  note: string | null
  price: number
}

export type RejectReason = { code: string; label: string }
