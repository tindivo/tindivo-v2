import { describe, expect, it } from 'vitest'
import { computeNoShowCountdown } from '../no-show'

/**
 * Lo que se protege es que el umbral venga de `app_settings`, no del código.
 *
 * `noShowWaitMinutes` es editable desde /admin/configuracion («Espera no-show
 * (min)») y `advance_order` lo valida contra `arrived_at_customer_at` antes de
 * aceptar el reporte. El front lo tenía escrito a mano con un 5, así que subirlo
 * desde el panel habilitaba el botón antes de tiempo: el motorizado pulsaba —de
 * pie en la puerta del cliente, con la comida— y el servidor se lo rechazaba.
 *
 * La regresión es silenciosa: con la configuración por defecto (5) todo coincide
 * y nada se ve mal. Solo aparece el día que alguien toca el panel.
 */

const LLEGADA = '2026-08-18T20:00:00.000Z'
const T0 = Date.parse(LLEGADA)
const min = (n: number) => n * 60_000

describe('computeNoShowCountdown', () => {
  it('el umbral sale del ajuste, no del codigo', () => {
    // A los 6 minutos de llegar: con el ajuste en 5 ya se puede reportar, con el
    // ajuste en 8 todavía no. Es el caso exacto que fallaba.
    expect(computeNoShowCountdown(LLEGADA, 5, T0 + min(6)).canReport).toBe(true)
    expect(computeNoShowCountdown(LLEGADA, 8, T0 + min(6)).canReport).toBe(false)
  })

  it('cuenta atras hacia el limite que marque el ajuste', () => {
    expect(computeNoShowCountdown(LLEGADA, 5, T0 + min(2)).formatted).toBe('3:00')
    expect(computeNoShowCountdown(LLEGADA, 8, T0 + min(2)).formatted).toBe('6:00')
  })

  it('habilita justo al cumplirse, ni antes ni por los pelos', () => {
    expect(computeNoShowCountdown(LLEGADA, 5, T0 + min(5) - 1).canReport).toBe(false)
    expect(computeNoShowCountdown(LLEGADA, 5, T0 + min(5)).canReport).toBe(true)
  })

  it('formatea los segundos a dos digitos', () => {
    // 4:05, no 4:5.
    expect(computeNoShowCountdown(LLEGADA, 5, T0 + min(1) - 5_000).formatted).toBe('4:05')
  })

  it('sin marca de llegada no se puede reportar', () => {
    // El servidor exige «Primero marca que llegaste al domicilio»; ofrecer el
    // botón aquí sería mandar al motorizado contra un rechazo seguro.
    expect(computeNoShowCountdown(null, 5, T0).canReport).toBe(false)
    expect(computeNoShowCountdown(undefined, 5, T0).canReport).toBe(false)
  })

  it('una fecha corrupta NO habilita el boton', () => {
    // `Date.parse` de una fecha inválida da NaN, y la resta con NaN nunca es
    // mayor que cero: el cálculo ingenuo lo tomaba por «tiempo cumplido» y
    // habilitaba el reporte.
    expect(computeNoShowCountdown('no-es-una-fecha', 5, T0).canReport).toBe(false)
  })

  it('pasado el limite se queda en cero, sin numeros negativos', () => {
    const c = computeNoShowCountdown(LLEGADA, 5, T0 + min(30))
    expect(c.remainingSec).toBe(0)
    expect(c.formatted).toBe('0:00')
    expect(c.canReport).toBe(true)
  })
})
