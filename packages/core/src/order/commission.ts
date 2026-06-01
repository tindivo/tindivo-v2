import type { DeliveryMethod, DistanceBand } from '@tindivo/contracts'
import { CommissionConfigError } from '../shared/errors'
import { roundMoney } from './money'

/** Comisión total a Tindivo por banda (de app_settings.commissions). */
export interface CommissionConfig {
  pickup: number
  near: number
  far: number
}

/** Overrides por negocio (null/undefined = usa el default global). */
export interface CommissionOverrides {
  pickup?: number | null
  near?: number | null
  far?: number | null
}

/**
 * Comisión TOTAL a Tindivo, snapshot al entregar (Documento Maestro §1):
 *   Cerca S/3.00 · Lejos S/3.50 · Pickup S/0.50.
 * La banda la declara el motorizado al recoger; en pickup no hay banda.
 * Cancelados NO llaman a esto (no suman comisión).
 */
export function computeCommission(args: {
  deliveryMethod: DeliveryMethod
  band: DistanceBand | null
  config: CommissionConfig
  overrides?: CommissionOverrides
}): number {
  const { deliveryMethod, band, config, overrides } = args

  if (deliveryMethod === 'pickup') {
    return roundMoney(overrides?.pickup ?? config.pickup)
  }

  if (band === null) {
    throw new CommissionConfigError(
      'La banda de distancia es obligatoria para delivery (se declara al recoger)',
    )
  }

  const override = band === 'near' ? overrides?.near : overrides?.far
  const base = band === 'near' ? config.near : config.far
  return roundMoney(override ?? base)
}
